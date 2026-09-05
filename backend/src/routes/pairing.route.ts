import { Router } from "express";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import rateLimit from "express-rate-limit";
import type { HydratedDocument } from "mongoose";

import { requireBootstrapKey, requireDeviceAuth, requireRoles, requireUserAuth } from "../middlewares/auth.js";
import { DeviceModel } from "../models/device.model.js";
import { PairingAuditModel } from "../models/pairing-audit.model.js";
import { PairingCodeModel, type PairingCodeDoc } from "../models/pairing-code.model.js";
import { deviceRepository } from "../repositories/device.repository.js";
import jwt from "jsonwebtoken";
import { isPostgresConnected, getPostgresPool } from "../lib/postgres.js";
import { disconnectDeviceSockets } from "../sockets/registry.js";

function generatePairingCode(): string {
  return randomInt(100000, 1000000).toString();
}

function hashDeviceProof(proof: string): string {
  return createHash("sha256").update(proof, "utf8").digest("hex");
}

function isValidDeviceProof(proof: string): boolean {
  return /^[A-Za-z0-9_-]{32,128}$/.test(proof);
}

function deviceProofMatches(storedHash: string | null | undefined, proof: string): boolean {
  if (!storedHash || !/^[a-f0-9]{64}$/i.test(storedHash)) return false;
  const expected = Buffer.from(storedHash, "hex");
  const actual = Buffer.from(hashDeviceProof(proof), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
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
    legacyHeaders: false,
    keyGenerator(req) {
      const hardwareId = String(req.body?.hardware_id ?? "").trim().slice(0, 160);
      return hardwareId || req.socket.remoteAddress || "unknown";
    }
  });

  router.post(
    "/request-code",
    pairingLimiter,
    requireBootstrapKey(deps.bootstrapKey),
    async (req, res) => {
      try {
        const hardwareId = String(req.body?.hardware_id ?? "").trim();
        const tenantId = req.body?.tenant_id ? String(req.body.tenant_id).trim() : null;
        const deviceProof = String(req.body?.device_proof ?? "").trim();

        if (!hardwareId || !isValidDeviceProof(deviceProof)) {
          res.status(400).json({
            code: "VALIDATION_ERROR",
            message: "hardware_id and a valid device_proof are required"
          });
          return;
        }

        const requestedCredentialHash = hashDeviceProof(deviceProof);
        let credentialRecovery = false;
        let device = await DeviceModel.findOne({ hardwareId }).select("+deviceCredentialHash");

        if (!device) {
          device = await DeviceModel.create({
            hardwareId,
            tenantId: tenantId || null,
            status: "offline",
            deviceCredentialHash: requestedCredentialHash
          });
        } else {
          const proofMatches = deviceProofMatches(device.deviceCredentialHash, deviceProof);
          if (device.pairedOwnerUserId && proofMatches) {
            res.status(409).json({
              code: "DEVICE_ALREADY_PAIRED",
              message: "Device is already paired; use its existing session or unpair it before re-enrollment"
            });
            return;
          }

          if (!device.deviceCredentialHash) {
            device.deviceCredentialHash = requestedCredentialHash;
            await device.save();
          } else if (!proofMatches) {
            // App reinstall clears the Keystore-backed proof while ANDROID_ID stays
            // stable. Store the replacement proof only on the short-lived pairing
            // code; an authorized user must confirm the physical display code
            // before the device credential can be rotated.
            credentialRecovery = true;
          }
        }

        try {
          await deviceRepository.syncPairingRequest({ tenantId: device.tenantId || null, hardwareId });
        } catch (error) {
          console.error("[pairing] postgres shadow write failed (request-code)", error);
        }

        const now = new Date();
        const requestedExpiresAt = new Date(now.getTime() + 5 * 60 * 1000);
        const deviceId = String(device._id);
        await PairingCodeModel.deleteMany({
          deviceId,
          consumedAt: null,
          $or: [
            { expiresAt: { $lte: now } },
            { deviceCredentialHash: { $ne: requestedCredentialHash }, claimedAt: null }
          ]
        });

        let activeCode = await PairingCodeModel.findOne({
          deviceId,
          deviceCredentialHash: requestedCredentialHash,
          consumedAt: null,
          expiresAt: { $gt: now }
        }).select({ code: 1, expiresAt: 1 }).lean();

        for (let attempt = 0; !activeCode && attempt < 10; attempt += 1) {
          const candidate = generatePairingCode();
          try {
            activeCode = await PairingCodeModel.create({
              code: candidate,
              deviceId,
              tenantId: device.tenantId || tenantId || null,
              expiresAt: requestedExpiresAt,
              consumedAt: null,
              deviceCredentialHash: requestedCredentialHash,
              claimedAt: null,
              claimedBy: null
            });
          } catch (error) {
            const duplicateKey = typeof error === "object" && error !== null && "code" in error && error.code === 11000;
            if (!duplicateKey) throw error;
            activeCode = await PairingCodeModel.findOne({
              deviceId,
              deviceCredentialHash: requestedCredentialHash,
              consumedAt: null,
              expiresAt: { $gt: now }
            }).select({ code: 1, expiresAt: 1 }).lean();
          }
        }

        const code = activeCode?.code ?? null;
        const codeExpiresAt = activeCode?.expiresAt ?? requestedExpiresAt;
        if (!code) {
          res.status(503).json({ code: "PAIRING_CODE_CAPACITY", message: "Could not allocate a pairing code; retry shortly" });
          return;
        }

        await PairingAuditModel.create({
          tenantId: tenantId || "unassigned",
          deviceId: String(device._id),
          hardwareId,
          eventType: "PAIRING_CODE_REQUESTED",
          actorType: "device",
          actorId: hardwareId,
          result: "success",
          reason: credentialRecovery ? "DEVICE_CREDENTIAL_RECOVERY" : null
        });

        res.status(201).json({
          code,
          expires_at: codeExpiresAt.toISOString(),
          device_id: String(device._id),
          credential_recovery: credentialRecovery
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
      const pairingCode = String(req.body?.pairing_code ?? "").trim();
      if (!pairingCode) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "pairing_code is required" });
        return;
      }

      const claimedAt = new Date();
      const staleClaimBefore = new Date(claimedAt.getTime() - 30_000);
      const claimedBy = req.auth!.userId;
      let claimedCode: HydratedDocument<PairingCodeDoc> | null = null;

      try {
        claimedCode = await PairingCodeModel.findOneAndUpdate(
          {
            code: pairingCode,
            consumedAt: null,
            expiresAt: { $gt: claimedAt },
            $or: [
              { claimedAt: null },
              { claimedAt: { $lt: staleClaimBefore } }
            ]
          },
          { $set: { claimedAt, claimedBy } },
          { new: true, sort: { createdAt: -1 } }
        ).select("+deviceCredentialHash");

        if (!claimedCode) {
          await PairingAuditModel.create({
            tenantId: req.auth?.tenantId ?? "unknown",
            deviceId: null,
            hardwareId: null,
            eventType: "PAIRING_CONFIRM_FAILED",
            actorType: "user",
            actorId: req.auth?.userId ?? null,
            result: "failure",
            reason: "PAIRING_CODE_INVALID_EXPIRED_OR_BUSY"
          });
          res.status(404).json({ code: "PAIRING_CODE_INVALID", message: "Code is invalid, expired, or currently being confirmed" });
          return;
        }

        const releaseClaim = async () => {
          await PairingCodeModel.updateOne(
            { _id: claimedCode!._id, claimedAt, claimedBy, consumedAt: null },
            { $set: { claimedAt: null, claimedBy: null } }
          );
        };

        if (!claimedCode.deviceCredentialHash) {
          await releaseClaim();
          res.status(409).json({
            code: "PAIRING_CODE_REFRESH_REQUIRED",
            message: "This code was issued by an older server version; wait for the device to display a new code"
          });
          return;
        }

        const device = await DeviceModel.findById(claimedCode.deviceId).select("+deviceCredentialHash");
        if (!device) {
          await releaseClaim();
          res.status(404).json({ code: "DEVICE_NOT_FOUND", message: "Device no longer exists" });
          return;
        }

        const existingTenantId = device.tenantId ? String(device.tenantId) : null;
        if (device.pairedOwnerUserId && existingTenantId && existingTenantId !== req.auth!.tenantId) {
          await releaseClaim();
          await PairingAuditModel.create({
            tenantId: req.auth!.tenantId,
            deviceId: String(device._id),
            hardwareId: device.hardwareId,
            eventType: "PAIRING_CONFIRM_FAILED",
            actorType: "user",
            actorId: req.auth!.userId,
            result: "failure",
            reason: "DEVICE_OWNED_BY_ANOTHER_TENANT"
          });
          res.status(409).json({
            code: "DEVICE_OWNED_BY_ANOTHER_TENANT",
            message: "This device must be unpaired by its current tenant before it can be transferred"
          });
          return;
        }

        const credentialRecovered = Boolean(
          device.deviceCredentialHash && device.deviceCredentialHash !== claimedCode.deviceCredentialHash
        );
        const mongoDevice = await DeviceModel.findOneAndUpdate(
          {
            _id: device._id,
            $or: [
              { pairedOwnerUserId: null },
              { tenantId: req.auth!.tenantId }
            ]
          },
          {
            $set: {
              tenantId: req.auth!.tenantId,
              pairedOwnerUserId: req.auth!.userId,
              deviceCredentialHash: claimedCode.deviceCredentialHash,
              // Pairing confirmation does not prove that the Android player has
              // established its authenticated socket session.
              status: "offline"
            }
          },
          { new: true }
        ).select({ hardwareId: 1 }).lean();

        if (!mongoDevice) {
          await releaseClaim();
          res.status(409).json({
            code: "DEVICE_PAIRING_CONFLICT",
            message: "Device ownership changed while the code was being confirmed; request a new code"
          });
          return;
        }

        const consumedCode = await PairingCodeModel.findOneAndUpdate(
          { _id: claimedCode._id, claimedAt, claimedBy, consumedAt: null },
          { $set: { consumedAt: new Date(), claimedAt: null, claimedBy: null } },
          { new: true }
        );
        if (!consumedCode) {
          console.error("[pairing] device linked but pairing-code consume finalization failed", {
            deviceId: String(device._id)
          });
        }

        try {
          await deviceRepository.markPairedByHardware({
            tenantId: req.auth!.tenantId,
            hardwareId: mongoDevice.hardwareId,
            pairedOwnerUserId: req.auth!.userId
          });
        } catch (error) {
          console.error("[pairing] postgres shadow write failed (confirm)", error);
        }

        await PairingAuditModel.create({
          tenantId: req.auth!.tenantId,
          deviceId: String(device._id),
          hardwareId: mongoDevice.hardwareId,
          eventType: "PAIRING_CONFIRMED",
          actorType: "user",
          actorId: req.auth!.userId,
          result: "success",
          reason: credentialRecovered ? "DEVICE_CREDENTIAL_RECOVERED" : null
        });

        res.json({
          linked: true,
          device_id: String(device._id),
          credential_recovered: credentialRecovered
        });
      } catch (error) {
        if (claimedCode) {
          await PairingCodeModel.updateOne(
            { _id: claimedCode._id, claimedAt, claimedBy, consumedAt: null },
            { $set: { claimedAt: null, claimedBy: null } }
          ).catch(() => undefined);
        }
        console.error("[pairing] confirm failed", error);
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
        const deviceProof = String(req.body?.device_proof ?? "").trim();

        if (!hardwareId || !isValidDeviceProof(deviceProof)) {
          res.status(400).json({ code: "VALIDATION_ERROR", message: "hardware_id and a valid device_proof are required" });
          return;
        }

        const device = await DeviceModel.findOne({ hardwareId }).select("+deviceCredentialHash");
        if (!device) {
          res.status(404).json({ code: "DEVICE_NOT_FOUND", message: "Device not found" });
          return;
        }

        if (!deviceProofMatches(device.deviceCredentialHash, deviceProof)) {
          if (device.deviceCredentialHash) {
            res.status(401).json({ code: "DEVICE_CREDENTIAL_INVALID", message: "Invalid device credential" });
            return;
          }
          device.deviceCredentialHash = hashDeviceProof(deviceProof);
          await device.save();
        }

        if (!device.pairedOwnerUserId || !device.tenantId) {
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
            expiresIn: "48h",   // 48 h: survives 2-day network outages without content loss
            issuer: deps.jwtIssuer,
            audience: deps.jwtAudience,
            notBefore: "0s"
          }
        );

        await PairingAuditModel.create({
          tenantId: device.tenantId,
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
          tenant_id: device.tenantId,
          access_token: deviceToken,
          token_type: "Bearer",
          expires_in: 60 * 60 * 48
        });
      } catch {
        res.status(500).json({ code: "DEVICE_SESSION_FAILED", message: "Failed to refresh device session" });
      }
    }
  );

  router.post(
    "/unpair",
    pairingLimiter,
    requireDeviceAuth(deps.jwtSecret, { issuer: deps.jwtIssuer, audience: deps.jwtAudience }),
    async (req, res) => {
      try {
        const hardwareId = req.auth?.hardwareId;
        if (!hardwareId || req.auth?.role !== "device") {
          res.status(401).json({ code: "DEVICE_UNAUTHORIZED", message: "Valid device session required" });
          return;
        }

        const device = await DeviceModel.findOne({ _id: req.auth.userId, hardwareId, tenantId: req.auth.tenantId });
        if (!device) {
          res.status(404).json({ code: "DEVICE_NOT_FOUND", message: "Device not found" });
          return;
        }

        const oldTenantId = device.tenantId;

        device.tenantId = null;
        device.pairedOwnerUserId = null;
        device.currentPlaylistId = null;
        device.currentMediaId = null;
        device.playbackStartedAt = null;
        device.status = "offline";
        await device.save();
        disconnectDeviceSockets(String(device._id));

        if (isPostgresConnected() && oldTenantId) {
          try {
            const pool = getPostgresPool();
            await pool.query(
              `UPDATE devices
               SET tenant_id = NULL,
                   paired_owner_user_id = NULL,
                   status = 'offline',
                   current_playlist_id = NULL,
                   updated_at = CURRENT_TIMESTAMP
               WHERE hardware_id = $1
                 AND deleted_at IS NULL`,
              [hardwareId]
            );
          } catch (err) {
            console.error("[pairing] postgres shadow write failed (unpair)", err);
          }
        }

        res.status(200).json({ unpaired: true });
      } catch {
        res.status(500).json({ code: "UNPAIR_FAILED", message: "Failed to unpair device" });
      }
    }
  );

  return router;
}
