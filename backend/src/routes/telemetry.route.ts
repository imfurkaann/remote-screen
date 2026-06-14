import { Router } from "express";

import { requireRoles, requireUserAuth } from "../middlewares/auth.js";
import { DeviceModel } from "../models/device.model.js";
import {
  TELEMETRY_KINDS,
  TelemetryModel,
  type TelemetryDoc,
  type TelemetryKind
} from "../models/telemetry.model.js";

type TelemetryRouteDeps = {
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
};

type AuthContext = {
  userId: string;
  tenantId: string;
  role: string;
};

function isTelemetryKind(value: string): value is TelemetryKind {
  return (TELEMETRY_KINDS as readonly string[]).includes(value);
}

function canWriteDeviceTelemetry(reqDeviceId: string, auth?: AuthContext): boolean {
  if (!auth) {
    return false;
  }

  if (auth.role === "device") {
    return auth.userId === reqDeviceId;
  }

  return ["tenant_owner", "tenant_admin", "operator"].includes(auth.role);
}

function toApiTelemetry(doc: TelemetryDoc & { _id: unknown; createdAt?: Date }): Record<string, unknown> {
  return {
    id: String(doc._id),
    tenant_id: doc.tenantId,
    device_id: doc.deviceId,
    kind: doc.kind,
    correlation_id: doc.correlationId,
    payload: doc.payload,
    created_at: doc.createdAt?.toISOString() ?? null
  };
}

export function buildTelemetryRouter(deps: TelemetryRouteDeps): Router {
  const router = Router();

  router.post(
    "/devices/:deviceId/telemetry",
    requireUserAuth(deps.jwtSecret, { issuer: deps.jwtIssuer, audience: deps.jwtAudience }),
    async (req, res) => {
    try {
      const auth = req.auth;
      const tenantId = auth?.tenantId;
      const deviceId = String(req.params.deviceId ?? "").trim();
      const kindRaw = String(req.body?.kind ?? "").trim();
      const payload =
        req.body?.payload && typeof req.body.payload === "object" && !Array.isArray(req.body.payload)
          ? (req.body.payload as Record<string, unknown>)
          : {};
      const correlationId =
        String(req.body?.correlation_id ?? req.correlationId ?? "").trim() || req.correlationId;

      if (!tenantId || !deviceId || !isTelemetryKind(kindRaw)) {
        res.status(400).json({
          code: "VALIDATION_ERROR",
          message: "deviceId and valid kind are required"
        });
        return;
      }

      if (!canWriteDeviceTelemetry(deviceId, auth)) {
        res.status(403).json({ code: "FORBIDDEN", message: "Insufficient role" });
        return;
      }

      if (auth?.role !== "device" && auth?.role !== "tenant_owner") {
        const d = await DeviceModel.findOne({ _id: deviceId, tenantId, pairedOwnerUserId: auth?.userId });
        if (!d) {
          res.status(403).json({ code: "FORBIDDEN", message: "Insufficient permissions for this device" });
          return;
        }
      }

      const device = await DeviceModel.findOne({ _id: deviceId, tenantId });
      if (!device) {
        res.status(404).json({ code: "DEVICE_NOT_FOUND", message: "Device not found" });
        return;
      }

      await TelemetryModel.create({
        tenantId,
        deviceId,
        kind: kindRaw,
        correlationId,
        payload
      });

      if (kindRaw === "heartbeat") {
        await DeviceModel.updateOne(
          { _id: deviceId, tenantId },
          {
            $set: {
              status: "online",
              lastHeartbeatAt: new Date(),
              lastSeenAt: new Date()
            }
          }
        );
      }

      res.status(202).json({ accepted: true, correlation_id: correlationId });
    } catch {
      res.status(500).json({ code: "TELEMETRY_INGEST_FAILED", message: "Failed to ingest telemetry" });
    }
    }
  );

  router.get(
    "/devices/:deviceId/telemetry",
    requireUserAuth(deps.jwtSecret, { issuer: deps.jwtIssuer, audience: deps.jwtAudience }),
    requireRoles(["tenant_owner", "tenant_admin", "operator"]),
    async (req, res) => {
      try {
        const tenantId = req.auth?.tenantId;
        const deviceId = String(req.params.deviceId ?? "").trim();
        const kindRaw = String(req.query.kind ?? "").trim();
        const limit = Math.min(Math.max(Number(req.query.limit ?? 100), 1), 500);

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

        const query: {
          tenantId: string;
          deviceId: string;
          kind?: TelemetryKind;
        } = { tenantId, deviceId };

        if (kindRaw) {
          if (!isTelemetryKind(kindRaw)) {
            res.status(400).json({ code: "VALIDATION_ERROR", message: "invalid kind" });
            return;
          }
          query.kind = kindRaw;
        }

        const telemetry = await TelemetryModel.find(query).sort({ createdAt: -1 }).limit(limit);
        res.json({
          telemetry: telemetry.map((item) =>
            toApiTelemetry(item.toObject() as TelemetryDoc & { _id: unknown; createdAt?: Date })
          )
        });
      } catch {
        res.status(500).json({ code: "TELEMETRY_QUERY_FAILED", message: "Failed to query telemetry" });
      }
    }
  );

  return router;
}
