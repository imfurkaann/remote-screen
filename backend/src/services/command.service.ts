import { type HydratedDocument } from "mongoose";

import { CommandModel, type CommandDoc, type CommandType } from "../models/command.model.js";
import { DeviceModel } from "../models/device.model.js";
import { commandRepository } from "../repositories/command.repository.js";
import { emitCommandDispatch } from "../sockets/registry.js";

const activeTimeouts = new Map<string, NodeJS.Timeout>();

export type QueueCommandInput = {
  tenantId: string;
  deviceId: string;
  commandId: string;
  commandType: CommandType;
  payload: Record<string, unknown>;
  maxAttempts?: number;
  timeoutMs?: number;
};

export type DeviceAckPayload = {
  device_id: string;
  command_id: string;
  status: "ACK" | "COMPLETED" | "FAILED";
  screenshot_url?: string;
  error_message?: string;
};

function terminalStatus(status: string): boolean {
  return status === "completed" || status === "failed" || status === "timeout";
}

async function syncShadowCommand(command: HydratedDocument<CommandDoc>): Promise<void> {
  await commandRepository.upsertShadowCommand({
    tenantId: command.tenantId,
    deviceId: command.deviceId,
    commandId: command.commandId,
    commandType: command.commandType,
    payload: command.payload as Record<string, unknown>,
    status: command.status,
    attempts: command.attempts,
    maxAttempts: command.maxAttempts,
    timeoutMs: command.timeoutMs,
    sentAt: command.sentAt,
    ackAt: command.ackAt,
    completedAt: command.completedAt,
    timeoutAt: command.timeoutAt,
    screenshotUrl: command.screenshotUrl,
    errorMessage: command.errorMessage
  });
}

function clearCommandTimer(commandMongoId: string): void {
  const timer = activeTimeouts.get(commandMongoId);
  if (!timer) {
    return;
  }
  clearTimeout(timer);
  activeTimeouts.delete(commandMongoId);
}

async function scheduleCommandTimeout(commandMongoId: string, timeoutMs: number): Promise<void> {
  clearCommandTimer(commandMongoId);

  const timer = setTimeout(async () => {
    try {
      const command = await CommandModel.findById(commandMongoId);
      if (!command || terminalStatus(command.status)) {
        clearCommandTimer(commandMongoId);
        return;
      }

      if (command.attempts < command.maxAttempts) {
        await CommandModel.updateOne(
          { _id: command._id },
          {
            $set: {
              status: "queued",
              timeoutAt: null
            }
          }
        );

        const queuedCommand = await CommandModel.findById(commandMongoId);
        if (queuedCommand) {
          await syncShadowCommand(queuedCommand);
        }

        clearCommandTimer(commandMongoId);
        await dispatchCommandById(commandMongoId);
        return;
      }

      await CommandModel.updateOne(
        { _id: command._id },
        {
          $set: {
            status: "timeout",
            completedAt: new Date(),
            errorMessage: "Command timed out after max attempts"
          }
        }
      );

      const timedOutCommand = await CommandModel.findById(commandMongoId);
      if (timedOutCommand) {
        await syncShadowCommand(timedOutCommand);
      }

      clearCommandTimer(commandMongoId);
    } catch {
      clearCommandTimer(commandMongoId);
    }
  }, timeoutMs);

  activeTimeouts.set(commandMongoId, timer);
}

export async function dispatchCommandById(commandMongoId: string): Promise<void> {
  const command = await CommandModel.findById(commandMongoId);
  if (!command || terminalStatus(command.status)) {
    return;
  }

  const now = new Date();
  const timeoutAt = new Date(now.getTime() + command.timeoutMs);
  const nextAttempt = command.attempts + 1;

  const updated = await CommandModel.findOneAndUpdate(
    {
      _id: command._id,
      status: { $in: ["queued", "sent", "acknowledged"] }
    },
    {
      $set: {
        status: "sent",
        sentAt: now,
        timeoutAt,
        errorMessage: null
      },
      $inc: {
        attempts: 1
      }
    },
    { new: true }
  );

  if (!updated) {
    return;
  }

  await syncShadowCommand(updated);

  const targetDevice = await DeviceModel.findById(updated.deviceId);
  const socketDeviceId = targetDevice?.hardwareId ?? updated.deviceId;

  emitCommandDispatch(socketDeviceId, {
    command_id: updated.commandId,
    command_type: updated.commandType,
    payload: updated.payload,
    timeout_ms: updated.timeoutMs,
    attempt: nextAttempt
  });

  if (socketDeviceId !== updated.deviceId) {
    emitCommandDispatch(updated.deviceId, {
      command_id: updated.commandId,
      command_type: updated.commandType,
      payload: updated.payload,
      timeout_ms: updated.timeoutMs,
      attempt: nextAttempt
    });
  }

  await scheduleCommandTimeout(String(updated._id), updated.timeoutMs);
}

export async function queueCommand(
  input: QueueCommandInput
): Promise<{ created: boolean; command: HydratedDocument<CommandDoc> }> {
  const existing = await CommandModel.findOne({
    tenantId: input.tenantId,
    deviceId: input.deviceId,
    commandId: input.commandId
  });

  if (existing) {
    return { created: false, command: existing };
  }

  const device = await DeviceModel.findOne({ _id: input.deviceId, tenantId: input.tenantId });
  if (!device) {
    throw new Error("DEVICE_NOT_FOUND");
  }

  const command = await CommandModel.create({
    tenantId: input.tenantId,
    deviceId: input.deviceId,
    commandId: input.commandId,
    commandType: input.commandType,
    payload: input.payload,
    status: "queued",
    attempts: 0,
    maxAttempts: Math.min(Math.max(input.maxAttempts ?? 2, 1), 5),
    timeoutMs: Math.min(Math.max(input.timeoutMs ?? 15_000, 2_000), 60_000)
  });

  await dispatchCommandById(String(command._id));
  return { created: true, command };
}

export async function processDeviceAck(payload: DeviceAckPayload): Promise<void> {
  let command = await CommandModel.findOne({
    deviceId: payload.device_id,
    commandId: payload.command_id
  });

  if (!command) {
    const device = await DeviceModel.findOne({ hardwareId: payload.device_id });
    if (device) {
      command = await CommandModel.findOne({
        deviceId: String(device._id),
        commandId: payload.command_id
      });
    }
  }

  if (!command || terminalStatus(command.status)) {
    return;
  }

  if (payload.status === "ACK") {
    await CommandModel.updateOne(
      { _id: command._id },
      {
        $set: {
          status: "acknowledged",
          ackAt: new Date()
        }
      }
    );

    const acknowledgedCommand = await CommandModel.findById(command._id);
    if (acknowledgedCommand) {
      await syncShadowCommand(acknowledgedCommand);
    }
    return;
  }

  if (payload.status === "COMPLETED") {
    await CommandModel.updateOne(
      { _id: command._id },
      {
        $set: {
          status: "completed",
          ackAt: command.ackAt ?? new Date(),
          completedAt: new Date(),
          screenshotUrl: payload.screenshot_url ?? null,
          errorMessage: null
        }
      }
    );

    const completedCommand = await CommandModel.findById(command._id);
    if (completedCommand) {
      await syncShadowCommand(completedCommand);
    }
    clearCommandTimer(String(command._id));
    return;
  }

  await CommandModel.updateOne(
    { _id: command._id },
    {
      $set: {
        status: "failed",
        ackAt: command.ackAt ?? new Date(),
        completedAt: new Date(),
        errorMessage: payload.error_message ?? "Command execution failed"
      }
    }
  );

  const failedCommand = await CommandModel.findById(command._id);
  if (failedCommand) {
    await syncShadowCommand(failedCommand);
  }
  clearCommandTimer(String(command._id));
}
