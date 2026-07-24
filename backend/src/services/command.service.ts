import { type HydratedDocument } from "mongoose";

import { CommandModel, type CommandDoc, type CommandType } from "../models/command.model.js";
import { DeviceModel } from "../models/device.model.js";
import { commandRepository } from "../repositories/command.repository.js";
import { emitCommandDispatch, hasConnectedDevice } from "../sockets/registry.js";

const activeTimeouts = new Map<string, NodeJS.Timeout>();

export type QueueCommandInput = {
  tenantId: string;
  deviceId: string;
  requestedByUserId?: string;
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
  diagnostics?: Record<string, any>;
};

function terminalStatus(status: string): boolean {
  return status === "completed" || status === "failed" || status === "timeout";
}

async function syncShadowCommand(command: HydratedDocument<CommandDoc>): Promise<void> {
  await commandRepository.upsertShadowCommand({
    tenantId: command.tenantId,
    deviceId: command.deviceId,
    requestedByUserId: command.requestedByUserId,
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

export async function dispatchCommandById(
  commandMongoId: string,
  options: { assumeConnected?: boolean } = {}
): Promise<void> {
  const command = await CommandModel.findById(commandMongoId);
  if (!command || terminalStatus(command.status)) return;

  // Keep commands queued while the device is offline. They are replayed by the
  // authenticated connection handler instead of exhausting retries into an empty room.
  if (!options.assumeConnected && !(await hasConnectedDevice(command.deviceId))) return;

  const now = new Date();
  const timeoutAt = new Date(now.getTime() + command.timeoutMs);
  const nextAttempt = command.attempts + 1;

  const updated = await CommandModel.findOneAndUpdate(
    {
      _id: command._id,
      status: "queued",
      $expr: { $lt: ["$attempts", "$maxAttempts"] }
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

  emitCommandDispatch(updated.deviceId, {
    command_id: updated.commandId,
    command_type: updated.commandType,
    payload: updated.payload,
    timeout_ms: updated.timeoutMs,
    attempt: nextAttempt
  });

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

  let command: HydratedDocument<CommandDoc>;
  try {
    command = await CommandModel.create({
      tenantId: input.tenantId,
      deviceId: input.deviceId,
      requestedByUserId: input.requestedByUserId ?? null,
      commandId: input.commandId,
      commandType: input.commandType,
      payload: input.payload,
      status: "queued",
      attempts: 0,
      maxAttempts: Math.min(Math.max(input.maxAttempts ?? 2, 1), 5),
      timeoutMs: Math.min(Math.max(input.timeoutMs ?? 15_000, 2_000), 60_000)
    });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    const duplicate = await CommandModel.findOne({
      tenantId: input.tenantId,
      deviceId: input.deviceId,
      commandId: input.commandId
    });
    if (!duplicate) throw error;
    return { created: false, command: duplicate };
  }

  await dispatchCommandById(String(command._id));
  return { created: true, command };
}

export async function recoverPendingCommands(batchSize = 5_000): Promise<void> {
  const pending = await CommandModel.find({
    status: { $in: ["sent", "acknowledged"] }
  })
    .sort({ createdAt: 1 })
    .limit(Math.min(Math.max(batchSize, 1), 10_000));

  const sent = pending.filter((command) => command.status === "sent");
  const now = new Date();
  const updates = sent.map((command) => {
    if (command.attempts >= command.maxAttempts) {
      command.status = "timeout";
      command.completedAt = now;
      command.timeoutAt = now;
      command.errorMessage = "Command recovery found max attempts exhausted";
    } else {
      command.status = "queued";
      command.timeoutAt = null;
    }
    return {
      updateOne: {
        filter: { _id: command._id, status: "sent" },
        update: {
          $set: {
            status: command.status,
            completedAt: command.completedAt,
            timeoutAt: command.timeoutAt,
            errorMessage: command.errorMessage
          }
        }
      }
    };
  });

  if (updates.length > 0) {
    await CommandModel.bulkWrite(updates, { ordered: false });
    for (let offset = 0; offset < sent.length; offset += 25) {
      await Promise.all(sent.slice(offset, offset + 25).map((command) => syncShadowCommand(command)));
    }
  }

  for (const command of pending) {
    if (command.status !== "acknowledged") continue;
    const remainingMs = command.timeoutAt
      ? Math.max(0, command.timeoutAt.getTime() - Date.now())
      : command.timeoutMs;
    await scheduleCommandTimeout(String(command._id), remainingMs);
  }
}
export async function dispatchPendingCommandsForDevice(deviceId: string, tenantId: string, limit = 100): Promise<number> {
  const staleBefore = new Date(Date.now() - 24 * 60 * 60_000);
  await CommandModel.updateMany(
    { deviceId, tenantId, status: "queued", createdAt: { $lt: staleBefore } },
    {
      $set: {
        status: "timeout",
        completedAt: new Date(),
        errorMessage: "Command expired while device was offline"
      }
    }
  );

  const queued = await CommandModel.find({
    deviceId,
    tenantId,
    status: "queued",
    createdAt: { $gte: staleBefore }
  })
    .sort({ createdAt: 1 })
    .limit(Math.min(Math.max(limit, 1), 500));

  for (const command of queued) {
    await dispatchCommandById(String(command._id), { assumeConnected: true });
  }
  return queued.length;
}

export async function processDeviceAck(payload: DeviceAckPayload): Promise<boolean> {
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

  if (!command) return false;
  if (terminalStatus(command.status)) return true;

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
    return true;
  }

  if (payload.status === "COMPLETED") {
    // If the device sent diagnostics back, update the command payload and the device diagnostics record.
    const diagnosticsData = payload.diagnostics ?? null;
    
    await CommandModel.updateOne(
      { _id: command._id },
      {
        $set: {
          status: "completed",
          ackAt: command.ackAt ?? new Date(),
          completedAt: new Date(),
          screenshotUrl: payload.screenshot_url ?? null,
          payload: diagnosticsData ? { ...command.payload, diagnostics: diagnosticsData } : command.payload,
          errorMessage: null
        }
      }
    );

    if (diagnosticsData) {
      await DeviceModel.updateOne(
        { _id: command.deviceId },
        {
          $set: {
            diagnostics: diagnosticsData,
            lastSeenAt: new Date()
          }
        }
      );
    }

    const completedCommand = await CommandModel.findById(command._id);
    if (completedCommand) {
      await syncShadowCommand(completedCommand);
    }
    clearCommandTimer(String(command._id));
    return true;
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
  return true;
}
