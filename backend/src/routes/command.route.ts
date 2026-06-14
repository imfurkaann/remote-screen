import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import { requireRoles, requireUserAuth } from "../middlewares/auth.js";
import { COMMAND_TYPES, CommandModel, type CommandType } from "../models/command.model.js";
import { DeviceModel } from "../models/device.model.js";
import { Logger } from "../lib/logger.js";
import { isPostgresConnected } from "../lib/postgres.js";
import { postgresCircuitBreaker } from "../lib/circuit-breaker.js";
import { metrics } from "../lib/metrics.js";
import { commandRepository, type ShadowCommandRow } from "../repositories/command.repository.js";
import { queueCommand } from "../services/command.service.js";

const logger = new Logger('CommandRoute');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

type CommandRouteDeps = {
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  readFromPostgresPercentage: number;
};

function isCommandType(value: string): value is CommandType {
  return (COMMAND_TYPES as readonly string[]).includes(value);
}

type CommandView = {
  _id: unknown;
  deviceId: string;
  commandId: string;
  commandType: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  maxAttempts: number;
  timeoutMs: number;
  sentAt: Date | null;
  ackAt: Date | null;
  completedAt: Date | null;
  timeoutAt: Date | null;
  screenshotUrl: string | null;
  errorMessage: string | null;
};

function toApiCommand(command: CommandView): Record<string, unknown> {
  return {
    id: String(command._id),
    device_id: command.deviceId,
    command_id: command.commandId,
    command_type: command.commandType,
    payload: command.payload,
    status: command.status,
    attempts: command.attempts,
    max_attempts: command.maxAttempts,
    timeout_ms: command.timeoutMs,
    sent_at: command.sentAt?.toISOString() ?? null,
    ack_at: command.ackAt?.toISOString() ?? null,
    completed_at: command.completedAt?.toISOString() ?? null,
    timeout_at: command.timeoutAt?.toISOString() ?? null,
    screenshot_url: command.screenshotUrl,
    error_message: command.errorMessage
  };
}

function shouldReadFromPostgres(percentage: number): boolean {
  if (!isPostgresConnected()) {
    return false;
  }
  if (percentage <= 0) {
    return false;
  }
  if (percentage >= 100) {
    return true;
  }
  return Math.random() * 100 < percentage;
}

function fromShadowRow(row: ShadowCommandRow): CommandView {
  return {
    _id: row.id,
    deviceId: row.device_id,
    commandId: row.command_id,
    commandType: row.command_type,
    payload: row.payload,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    timeoutMs: row.timeout_ms,
    sentAt: row.sent_at,
    ackAt: row.ack_at,
    completedAt: row.completed_at,
    timeoutAt: row.timeout_at,
    screenshotUrl: row.screenshot_url,
    errorMessage: row.error_message
  };
}

export function buildCommandRouter(deps: CommandRouteDeps): Router {
  const router = Router();

  router.use(requireUserAuth(deps.jwtSecret, { issuer: deps.jwtIssuer, audience: deps.jwtAudience }));

  router.post("/devices/:deviceId/screenshot", upload.single("file"), async (req, res) => {
    try {
      const auth = req.auth;
      const tenantId = auth?.tenantId;
      const deviceId = String(req.params.deviceId ?? "").trim();

      if (!tenantId || !deviceId) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "deviceId is required" });
        return;
      }

      if (!req.file) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "file is required" });
        return;
      }

      let isAllowed = false;
      if (auth.role === "device") {
        isAllowed = auth.userId === deviceId;
      } else if (auth.role === "tenant_owner") {
        isAllowed = true;
      } else if (["tenant_admin", "operator"].includes(auth.role)) {
        const d = await DeviceModel.findOne({ _id: deviceId, tenantId, pairedOwnerUserId: auth.userId });
        isAllowed = d !== null;
      }

      if (!isAllowed) {
        res.status(403).json({ code: "FORBIDDEN", message: "Insufficient permissions to upload device screenshot" });
        return;
      }

      const extension = path.extname(req.file.originalname) || ".png";
      const fileName = `${randomUUID()}${extension}`;
      const relativePath = path.join("uploads", "screenshots", tenantId, fileName);
      const absolutePath = path.resolve(process.cwd(), relativePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, req.file.buffer);

      const screenshotUrl = `/${relativePath.replace(/\\/g, "/")}`;

      res.status(201).json({ screenshot_url: screenshotUrl });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error("Screenshot upload failed", err, { deviceId: req.params.deviceId });
      res.status(500).json({ code: "SCREENSHOT_UPLOAD_FAILED", message: "Failed to upload screenshot" });
    }
  });

  router.use(requireRoles(["tenant_owner", "tenant_admin", "operator"]));

  router.post("/devices/:deviceId/commands", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const deviceId = String(req.params.deviceId ?? "").trim();
      const commandTypeRaw = String(req.body?.command_type ?? "").trim();
      const commandId = String(req.body?.command_id ?? randomUUID()).trim();
      const payload =
        req.body?.payload && typeof req.body.payload === "object" && !Array.isArray(req.body.payload)
          ? (req.body.payload as Record<string, unknown>)
          : {};

      if (!tenantId || !deviceId || !isCommandType(commandTypeRaw) || !commandId) {
        res.status(400).json({
          code: "VALIDATION_ERROR",
          message: "deviceId, command_type and command_id are required"
        });
        return;
      }

      if (req.auth?.role !== "tenant_owner") {
        const d = await DeviceModel.findOne({ _id: deviceId, tenantId, pairedOwnerUserId: req.auth?.userId });
        if (!d) {
          res.status(403).json({ code: "FORBIDDEN", message: "Insufficient permissions for this device" });
          return;
        }
      }

      const maxAttempts = Number(req.body?.max_attempts ?? 2);
      const timeoutMs = Number(req.body?.timeout_ms ?? 15_000);

      const queued = await queueCommand({
        tenantId,
        deviceId,
        commandId,
        commandType: commandTypeRaw,
        payload,
        maxAttempts,
        timeoutMs
      });

      // Async shadow write (non-blocking, errors are logged)
      try {
        const shadow = queued.command as unknown as CommandView;
        await commandRepository.upsertShadowCommand({
          tenantId,
          deviceId,
          commandId: shadow.commandId,
          commandType: shadow.commandType,
          payload: shadow.payload,
          status: shadow.status,
          attempts: shadow.attempts,
          maxAttempts: shadow.maxAttempts,
          timeoutMs: shadow.timeoutMs,
          sentAt: shadow.sentAt,
          ackAt: shadow.ackAt,
          completedAt: shadow.completedAt,
          timeoutAt: shadow.timeoutAt,
          screenshotUrl: shadow.screenshotUrl,
          errorMessage: shadow.errorMessage
        });
      } catch (shadowError) {
        // Log but don't fail the main request
        const err = shadowError instanceof Error ? shadowError : new Error(String(shadowError));
        logger.warn('Async shadow command write failed', {
          tenantId,
          deviceId,
          commandId,
          commandType: commandTypeRaw,
          errorMessage: err.message
        }, err);
      }

      res.status(queued.created ? 201 : 200).json({
        deduped: !queued.created,
        command: toApiCommand(queued.command as unknown as CommandView)
      });
    } catch (error) {
      if (error instanceof Error && error.message === "DEVICE_NOT_FOUND") {
        res.status(404).json({ code: "DEVICE_NOT_FOUND", message: "Target device not found" });
        return;
      }

      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Command dispatch failed', err, {
        deviceId: req.params.deviceId,
        tenantId: req.auth?.tenantId
      });

      res.status(500).json({
        code: "COMMAND_DISPATCH_FAILED",
        message: "Failed to dispatch command"
      });
    }
  });

  router.get("/devices/:deviceId/commands", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const deviceId = String(req.params.deviceId ?? "").trim();
      const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 100);

      if (!tenantId || !deviceId) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "deviceId is required" });
        return;
      }

      if (req.auth?.role !== "tenant_owner") {
        const d = await DeviceModel.findOne({ _id: deviceId, tenantId, pairedOwnerUserId: req.auth?.userId });
        if (!d) {
          res.status(403).json({ code: "FORBIDDEN", message: "Insufficient permissions for this device" });
          return;
        }
      }

      // Attempt PostgreSQL read based on percentage
      if (shouldReadFromPostgres(deps.readFromPostgresPercentage)) {
        const shadowRows = await commandRepository.listShadowCommands(tenantId, deviceId, limit);
        if (shadowRows && shadowRows.length > 0) {
          logger.debug('Served command list from PostgreSQL', {
            deviceId,
            tenantId,
            count: shadowRows.length
          });
          res.json({ commands: shadowRows.map((row) => toApiCommand(fromShadowRow(row))) });
          return;
        }
      }

      // Fallback to MongoDB
      const commands = await CommandModel.find({ tenantId, deviceId })
        .sort({ createdAt: -1 })
        .limit(limit);

      metrics.recordShadowRead('mongo', 0);

      res.json({ commands: commands.map((command) => toApiCommand(command as unknown as CommandView)) });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to list commands', err, {
        deviceId: req.params.deviceId,
        tenantId: req.auth?.tenantId
      });

      res.status(500).json({
        code: "COMMAND_LIST_FAILED",
        message: "Failed to list commands"
      });
    }
  });

  router.get("/devices/:deviceId/commands/:commandId", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const deviceId = String(req.params.deviceId ?? "").trim();
      const commandId = String(req.params.commandId ?? "").trim();

      if (!tenantId || !deviceId || !commandId) {
        res.status(400).json({
          code: "VALIDATION_ERROR",
          message: "deviceId and commandId are required"
        });
        return;
      }

      if (req.auth?.role !== "tenant_owner") {
        const d = await DeviceModel.findOne({ _id: deviceId, tenantId, pairedOwnerUserId: req.auth?.userId });
        if (!d) {
          res.status(403).json({ code: "FORBIDDEN", message: "Insufficient permissions for this device" });
          return;
        }
      }

      // Attempt PostgreSQL read based on percentage
      if (shouldReadFromPostgres(deps.readFromPostgresPercentage)) {
        const shadow = await commandRepository.getShadowCommand(tenantId, deviceId, commandId);
        if (shadow) {
          logger.debug('Served command detail from PostgreSQL', {
            deviceId,
            commandId,
            tenantId
          });
          res.json({ command: toApiCommand(fromShadowRow(shadow)) });
          return;
        }
      }

      // Fallback to MongoDB
      const command = await CommandModel.findOne({ tenantId, deviceId, commandId });
      if (!command) {
        res.status(404).json({
          code: "COMMAND_NOT_FOUND",
          message: "Command not found"
        });
        return;
      }

      metrics.recordShadowRead('mongo', 0);

      res.json({ command: toApiCommand(command as unknown as CommandView) });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to fetch command', err, {
        deviceId: req.params.deviceId,
        commandId: req.params.commandId,
        tenantId: req.auth?.tenantId
      });

      res.status(500).json({
        code: "COMMAND_GET_FAILED",
        message: "Failed to fetch command"
      });
    }
  });

  return router;
}
