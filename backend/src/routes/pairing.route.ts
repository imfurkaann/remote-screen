import { Router } from "express";
import { randomInt } from "node:crypto";
import rateLimit from "express-rate-limit";

import { requireBootstrapKey, requireRoles, requireUserAuth } from "../middlewares/auth.js";
import { DeviceModel } from "../models/device.model.js";
import { PairingAuditModel } from "../models/pairing-audit.model.js";
import { PairingCodeModel } from "../models/pairing-code.model.js";
import { deviceRepository } from "../repositories/device.repository.js";
import jwt from "jsonwebtoken";

function generatePairingCode(): string {
  return randomInt(100000, 1000000).toString();
}

type PairingRouteDeps = {
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  bootstrapKey: string;
};

export function buildPairingRouter(deps: PairingRouteDeps): Router {
  const router = Router();

  const isDev = process.env.NODE_ENV === "development";
  const pairingLimiter = rateLimit({
    windowMs: 60_000,
    max: isDev ? 1000 : 15,
    standardHeaders: true,
    legacyHeaders: false
  });

  router.post(
    "/request-code",
    pairingLimiter,
    requireBootstrapKey(deps.bootstrapKey),
    async (req, res) => {
      try {
        const hardwareId = String(req.body?.hardware_id ?? "").trim();
        const tenantId = String(req.body?.tenant_id ?? "").trim();

        if (!hardwareId || !tenantId) {
          res.status(400).json({
            code: "VALIDATION_ERROR",
            message: "hardware_id and tenant_id are required"
          });
          return;
        }

        let device = await DeviceModel.findOne({ hardwareId });

        if (!device) {
          device = await DeviceModel.create({
            hardwareId,
            tenantId,
            status: "offline"
          });
        } else if (device.tenantId !== tenantId) {
          // In local/dev pairing workflows, move the device to the requested tenant
          // so the dashboard and emulator stay in the same tenant context.
          device.tenantId = tenantId;
          device.pairedOwnerUserId = null;
          device.currentPlaylistId = null;
          device.status = "offline";
          await device.save();
        }

        try {
          await deviceRepository.syncPairingRequest({ tenantId, hardwareId });
        } catch (error) {
          console.error("[pairing] postgres shadow write failed (request-code)", error);
        }

        const code = generatePairingCode();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

        await PairingCodeModel.create({
          code,
          deviceId: String(device._id),
          tenantId,
          expiresAt,
          consumedAt: null
        });

        await PairingAuditModel.create({
          tenantId,
          deviceId: String(device._id),
          hardwareId,
          eventType: "PAIRING_CODE_REQUESTED",
          actorType: "device",
          actorId: hardwareId,
          result: "success",
          reason: null
        });

        res.status(201).json({
          code,
          expires_at: expiresAt.toISOString(),
          device_id: String(device._id)
        });
      } catch {
        res.status(500).json({ code: "PAIRING_REQUEST_FAILED", message: "Failed to create pairing code" });
      }
    }
  );

  router.post(
    "/confirm",
    pairingLimiter,
    requireUserAuth(deps.jwtSecret, { issuer: deps.jwtIssuer, audience: deps.jwtAudience }),
    requireRoles(["tenant_owner", "tenant_admin", "operator"]),
    async (req, res) => {
      try {
        const pairingCode = String(req.body?.pairing_code ?? "").trim();
        if (!pairingCode) {
          res.status(400).json({ code: "VALIDATION_ERROR", message: "pairing_code is required" });
          return;
        }

        const doc = await PairingCodeModel.findOne({
          code: pairingCode,
          consumedAt: null,
          expiresAt: { $gt: new Date() },
          tenantId: req.auth?.tenantId
        }).sort({ createdAt: -1 });

        if (!doc) {
          await PairingAuditModel.create({
            tenantId: req.auth?.tenantId ?? "unknown",
            deviceId: null,
            hardwareId: null,
            eventType: "PAIRING_CONFIRM_FAILED",
            actorType: "user",
            actorId: req.auth?.userId ?? null,
            result: "failure",
            reason: "PAIRING_CODE_INVALID_OR_EXPIRED"
          });

          res.status(404).json({ code: "PAIRING_CODE_INVALID", message: "Code is invalid or expired" });
          return;
        }

        await DeviceModel.updateOne(
          { _id: doc.deviceId, tenantId: req.auth?.tenantId },
          { $set: { pairedOwnerUserId: req.auth?.userId, status: "online", lastSeenAt: new Date() } }
        );

        const mongoDevice = await DeviceModel.findOne({ _id: doc.deviceId, tenantId: req.auth?.tenantId })
          .select({ hardwareId: 1 })
          .lean();

        if (mongoDevice?.hardwareId && req.auth?.userId && req.auth?.tenantId) {
          try {
            await deviceRepository.markPairedByHardware({
              tenantId: req.auth.tenantId,
              hardwareId: mongoDevice.hardwareId,
              pairedOwnerUserId: req.auth.userId
            });
          } catch (error) {
            console.error("[pairing] postgres shadow write failed (confirm)", error);
          }
        }

        doc.consumedAt = new Date();
        await doc.save();

        await PairingAuditModel.create({
          tenantId: req.auth?.tenantId ?? doc.tenantId,
          deviceId: doc.deviceId,
          hardwareId: null,
          eventType: "PAIRING_CONFIRMED",
          actorType: "user",
          actorId: req.auth?.userId ?? null,
          result: "success",
          reason: null
        });

        res.json({ linked: true, device_id: doc.deviceId });
      } catch {
        res.status(500).json({ code: "PAIRING_CONFIRM_FAILED", message: "Failed to confirm pairing" });
      }
    }
  );

  router.post(
    "/device-session",
    pairingLimiter,
    requireBootstrapKey(deps.bootstrapKey),
    async (req, res) => {
      try {
        const hardwareId = String(req.body?.hardware_id ?? "").trim();
        const tenantId = String(req.body?.tenant_id ?? "").trim();

        if (!hardwareId || !tenantId) {
          res.status(400).json({ code: "VALIDATION_ERROR", message: "hardware_id and tenant_id are required" });
          return;
        }

        const device = await DeviceModel.findOne({ hardwareId, tenantId });
        if (!device) {
          res.status(404).json({ code: "DEVICE_NOT_FOUND", message: "Device not found" });
          return;
        }

        if (!device.pairedOwnerUserId) {
          res.status(409).json({ code: "DEVICE_NOT_PAIRED", message: "Device is not paired yet" });
          return;
        }

        const deviceToken = jwt.sign(
          {
            sub: String(device._id),
            tenant_id: device.tenantId,
            role: "device",
            hardware_id: hardwareId,
            owner_user_id: device.pairedOwnerUserId
          },
          deps.jwtSecret,
          {
            expiresIn: "12h",
            issuer: deps.jwtIssuer,
            audience: deps.jwtAudience,
            notBefore: "0s"
          }
        );

        await PairingAuditModel.create({
          tenantId,
          deviceId: String(device._id),
          hardwareId,
          eventType: "DEVICE_SESSION_REFRESHED",
          actorType: "device",
          actorId: hardwareId,
          result: "success",
          reason: null
        });

        res.json({
          paired: true,
          device_id: String(device._id),
          access_token: deviceToken,
          token_type: "Bearer",
          expires_in: 60 * 60 * 12
        });
      } catch {
        res.status(500).json({ code: "DEVICE_SESSION_FAILED", message: "Failed to refresh device session" });
      }
    }
  );

  return router;
}
