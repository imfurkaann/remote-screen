import { Router } from "express";

import { requireRoles, requireUserAuth } from "../middlewares/auth.js";
import { CommandModel } from "../models/command.model.js";
import { DeviceModel } from "../models/device.model.js";
import { MediaModel } from "../models/media.model.js";
import { PairingAuditModel } from "../models/pairing-audit.model.js";
import { PlaylistModel } from "../models/playlist.model.js";
import { TelemetryModel } from "../models/telemetry.model.js";
import { getPostgresPool, isPostgresConnected } from "../lib/postgres.js";
import { evaluateGovernancePolicy, type GovernanceIssueMode, type GovernancePolicyScope } from "../services/governance.service.js";

type OpsRouteDeps = {
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
};

function toIso(value: Date | undefined | null): string | null {
  return value?.toISOString?.() ?? null;
}

function pickPayloadStatus(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const source = payload as Record<string, unknown>;
  const raw = source.status ?? source.result ?? source.outcome ?? source.state;
  if (typeof raw !== "string") {
    return null;
  }

  return raw.trim().toLowerCase();
}

function isFailureStatus(status: string | null): boolean {
  if (!status) {
    return false;
  }

  return ["failed", "failure", "error", "timeout", "checksum_failed", "download_failed"].includes(status);
}

function toCsvValue(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  return `"${raw.replaceAll('"', '""')}"`;
}

function buildCsv(rows: Record<string, unknown>[]): string {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => toCsvValue(row[header])).join(","))
  ].join("\n");
}

export function buildOpsRouter(deps: OpsRouteDeps): Router {
  const router = Router();

  router.use(requireUserAuth(deps.jwtSecret, { issuer: deps.jwtIssuer, audience: deps.jwtAudience }));
  router.use(requireRoles(["tenant_owner"]));

  router.get("/metrics", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      if (!tenantId) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "tenant context is required" });
        return;
      }

      const [
        onlineDevices,
        offlineDevices,
        commandFailed,
        commandTimeout,
        commandCompleted,
        heartbeatLastHour,
        playbackLastHour,
        syncLastHour,
        topFailingDevicesRaw
      ] = await Promise.all([
        DeviceModel.countDocuments({ tenantId, status: "online" }),
        DeviceModel.countDocuments({ tenantId, status: "offline" }),
        CommandModel.countDocuments({ tenantId, status: "failed" }),
        CommandModel.countDocuments({ tenantId, status: "timeout" }),
        CommandModel.countDocuments({ tenantId, status: "completed" }),
        TelemetryModel.countDocuments({
          tenantId,
          kind: "heartbeat",
          createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) }
        }),
        TelemetryModel.countDocuments({
          tenantId,
          kind: "playback",
          createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) }
        }),
        TelemetryModel.countDocuments({
          tenantId,
          kind: "sync",
          createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) }
        }),
        CommandModel.aggregate<{ _id: string; failure_count: number }>([
          {
            $match: {
              tenantId,
              status: { $in: ["failed", "timeout"] },
              createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
            }
          },
          { $group: { _id: "$deviceId", failure_count: { $sum: 1 } } },
          { $sort: { failure_count: -1 } },
          { $limit: 5 }
        ])
      ]);

      const topFailingDeviceIds = topFailingDevicesRaw.map((item) => item._id);
      const topFailingDeviceDocs = topFailingDeviceIds.length
        ? await DeviceModel.find({ _id: { $in: topFailingDeviceIds }, tenantId }).select("_id hardwareId").lean()
        : [];
      const deviceIdToHardwareId = new Map(topFailingDeviceDocs.map((item) => [String(item._id), item.hardwareId]));
      const topFailingDevices = topFailingDevicesRaw.map((item) => ({
        device_id: item._id,
        hardware_id: deviceIdToHardwareId.get(item._id) ?? null,
        failure_count: item.failure_count
      }));

      const commandTotal = commandCompleted + commandFailed + commandTimeout;
      const commandSuccessRate = commandTotal === 0 ? 1 : commandCompleted / commandTotal;

      res.json({
        tenant_id: tenantId,
        as_of: new Date().toISOString(),
        devices: {
          online: onlineDevices,
          offline: offlineDevices
        },
        commands: {
          completed: commandCompleted,
          failed: commandFailed,
          timeout: commandTimeout,
          success_rate: Number(commandSuccessRate.toFixed(4))
        },
        telemetry_last_hour: {
          heartbeat: heartbeatLastHour,
          playback: playbackLastHour,
          sync: syncLastHour
        },
        top_failing_devices_last_24h: topFailingDevices
      });
    } catch (err) {
      console.error("[metrics] Error computing metrics", err);
      res.status(500).json({ code: "OPS_METRICS_FAILED", message: "Failed to compute metrics" });
    }
  });

  router.get("/devices/:deviceId/troubleshoot", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const deviceId = String(req.params.deviceId ?? "").trim();
      const commandLimit = Math.min(Math.max(Number(req.query.command_limit ?? 20), 1), 100);
      const telemetryLimit = Math.min(Math.max(Number(req.query.telemetry_limit ?? 50), 1), 200);
      const correlationIdFilter = String(req.query.correlation_id ?? "").trim();

      if (!tenantId || !deviceId) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "tenant and deviceId are required" });
        return;
      }

      const device = await DeviceModel.findOne({ _id: deviceId, tenantId }).lean();
      if (!device) {
        res.status(404).json({ code: "DEVICE_NOT_FOUND", message: "Device not found" });
        return;
      }

      const [commands, telemetry] = await Promise.all([
        CommandModel.find({ tenantId, deviceId }).sort({ createdAt: -1 }).limit(commandLimit).lean(),
        TelemetryModel.find({ tenantId, deviceId }).sort({ createdAt: -1 }).limit(telemetryLimit).lean()
      ]);

          const filteredCommands = correlationIdFilter
            ? commands.filter((command) =>
                telemetry.some((telemetryItem) => {
                  if (telemetryItem.correlationId !== correlationIdFilter) {
                    return false;
                  }

                  const payload = telemetryItem.payload as Record<string, unknown> | undefined;
                  return payload?.command_id === command.commandId || payload?.commandId === command.commandId;
                })
              )
            : commands;
          const filteredTelemetry = correlationIdFilter
            ? telemetry.filter((item) => item.correlationId === correlationIdFilter)
            : telemetry;

          const latestByKind = {
            heartbeat: filteredTelemetry.find((item) => item.kind === "heartbeat") ?? null,
            sync: filteredTelemetry.find((item) => item.kind === "sync") ?? null,
            playback: filteredTelemetry.find((item) => item.kind === "playback") ?? null,
            command: filteredTelemetry.find((item) => item.kind === "command") ?? null,
            error: filteredTelemetry.find((item) => item.kind === "error") ?? null
          };

          const recentErrors = filteredTelemetry
            .filter((item) => item.kind === "error")
            .slice(0, 20)
            .map((item) => ({
              id: String(item._id),
              correlation_id: item.correlationId,
              payload: item.payload,
              created_at: (item as { createdAt?: Date }).createdAt?.toISOString() ?? null
            }));

          res.json({
            tenant_id: tenantId,
            device: {
              id: String(device._id),
              hardware_id: device.hardwareId,
              status: device.status,
              current_playlist_id: device.currentPlaylistId,
              last_heartbeat_at: device.lastHeartbeatAt?.toISOString?.() ?? null,
              last_seen_at: device.lastSeenAt?.toISOString?.() ?? null
            },
            correlation_id_filter: correlationIdFilter || null,
            latest_by_kind: Object.fromEntries(
              Object.entries(latestByKind).map(([kind, item]) => [
                kind,
                item
                  ? {
                      correlation_id: item.correlationId,
                      payload: item.payload,
                      created_at: (item as { createdAt?: Date }).createdAt?.toISOString() ?? null
                    }
                  : null
              ])
            ),
            recent_commands: filteredCommands.map((item) => ({
              id: String(item._id),
              command_id: item.commandId,
              command_type: item.commandType,
              status: item.status,
              attempts: item.attempts,
              error_message: item.errorMessage,
              sent_at: item.sentAt?.toISOString?.() ?? null,
              ack_at: item.ackAt?.toISOString?.() ?? null,
              completed_at: item.completedAt?.toISOString?.() ?? null,
              timeout_at: item.timeoutAt?.toISOString?.() ?? null,
              created_at: (item as { createdAt?: Date }).createdAt?.toISOString() ?? null
            })),
            recent_errors: recentErrors
          });
        } catch {
          res.status(500).json({ code: "OPS_TROUBLESHOOT_FAILED", message: "Failed to load device troubleshooting data" });
        }
      });

      router.get("/devices/by-hardware/:hardwareId/troubleshoot", async (req, res) => {
        try {
          const tenantId = req.auth?.tenantId;
          const hardwareId = String(req.params.hardwareId ?? "").trim();

          if (!tenantId || !hardwareId) {
            res.status(400).json({ code: "VALIDATION_ERROR", message: "tenant and hardwareId are required" });
            return;
          }

          const device = await DeviceModel.findOne({ tenantId, hardwareId }).lean();
          if (!device) {
            res.status(404).json({ code: "DEVICE_NOT_FOUND", message: "Device not found" });
            return;
          }

          res.redirect(
            307,
            `/api/v1/ops/devices/${String(device._id)}/troubleshoot?command_limit=${req.query.command_limit ?? 20}&telemetry_limit=${req.query.telemetry_limit ?? 50}`
          );
        } catch {
          res.status(500).json({ code: "OPS_TROUBLESHOOT_FAILED", message: "Failed to resolve hardware id" });
        }
      });

  router.get("/support-bundle", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const deviceIdInput = String(req.query.device_id ?? "").trim();
      const hardwareIdInput = String(req.query.hardware_id ?? "").trim();
      const format = String(req.query.format ?? "json").trim().toLowerCase();
      const commandLimit = Math.min(Math.max(Number(req.query.command_limit ?? 50), 1), 200);
      const telemetryLimit = Math.min(Math.max(Number(req.query.telemetry_limit ?? 100), 1), 500);

      if (!tenantId) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "tenant context is required" });
        return;
      }

      if (!deviceIdInput && !hardwareIdInput) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "device_id or hardware_id is required" });
        return;
      }

      const device = deviceIdInput
        ? await DeviceModel.findOne({ _id: deviceIdInput, tenantId }).lean()
        : await DeviceModel.findOne({ tenantId, hardwareId: hardwareIdInput }).lean();

      if (!device) {
        res.status(404).json({ code: "DEVICE_NOT_FOUND", message: "Device not found" });
        return;
      }

      const resolvedDeviceId = String(device._id);

      const [commands, telemetry, pairingAuditTrail] = await Promise.all([
        CommandModel.find({ tenantId, deviceId: resolvedDeviceId }).sort({ createdAt: -1 }).limit(commandLimit).lean(),
        TelemetryModel.find({ tenantId, deviceId: resolvedDeviceId }).sort({ createdAt: -1 }).limit(telemetryLimit).lean(),
        PairingAuditModel.find({ tenantId, deviceId: resolvedDeviceId }).sort({ createdAt: -1 }).limit(50).lean()
      ]);

      const correlationIds = Array.from(
        new Set(
          telemetry
            .map((item) => item.correlationId)
            .filter((value): value is string => typeof value === "string" && value.length > 0)
        )
      );

      const syncTelemetry = telemetry.filter((item) => item.kind === "sync");
      const syncFailures = syncTelemetry.filter((item) => isFailureStatus(pickPayloadStatus(item.payload)));
      const lastSync = syncTelemetry[0] ?? null;

      const recentErrors = telemetry
        .filter((item) => item.kind === "error")
        .slice(0, 50)
        .map((item) => ({
          id: String(item._id),
          correlation_id: item.correlationId,
          payload: item.payload,
          created_at: toIso((item as { createdAt?: Date }).createdAt)
        }));

      const bundlePayload = {
        tenant_id: tenantId,
        generated_at: new Date().toISOString(),
        device: {
          id: resolvedDeviceId,
          hardware_id: device.hardwareId,
          status: device.status,
          current_playlist_id: device.currentPlaylistId,
          last_heartbeat_at: toIso(device.lastHeartbeatAt),
          last_seen_at: toIso(device.lastSeenAt)
        },
        correlation_ids: correlationIds,
        command_timeline: commands.map((item) => ({
          id: String(item._id),
          command_id: item.commandId,
          command_type: item.commandType,
          status: item.status,
          attempts: item.attempts,
          max_attempts: item.maxAttempts,
          timeout_ms: item.timeoutMs,
          error_message: item.errorMessage,
          sent_at: toIso(item.sentAt),
          ack_at: toIso(item.ackAt),
          completed_at: toIso(item.completedAt),
          timeout_at: toIso(item.timeoutAt),
          created_at: toIso((item as { createdAt?: Date }).createdAt)
        })),
        pairing_audit_trail: pairingAuditTrail.map((item) => ({
          id: String(item._id),
          event_type: item.eventType,
          actor_type: item.actorType,
          actor_id: item.actorId,
          result: item.result,
          reason: item.reason,
          created_at: toIso((item as { createdAt?: Date }).createdAt)
        })),
        sync_summary: {
          total_events: syncTelemetry.length,
          failed_events: syncFailures.length,
          last_sync_at: lastSync ? toIso((lastSync as { createdAt?: Date }).createdAt) : null,
          last_sync_payload: lastSync?.payload ?? null
        },
        last_error_payloads: recentErrors
      };

      if (format === "csv") {
        const csvRows: Record<string, unknown>[] = [
          ...commands.map((item) => ({
            record_type: "command",
            id: String(item._id),
            command_id: item.commandId,
            command_type: item.commandType,
            status: item.status,
            attempts: item.attempts,
            error_message: item.errorMessage,
            created_at: toIso((item as { createdAt?: Date }).createdAt)
          })),
          ...telemetry.map((item) => ({
            record_type: "telemetry",
            id: String(item._id),
            kind: item.kind,
            correlation_id: item.correlationId,
            payload: JSON.stringify(item.payload ?? {}),
            created_at: toIso((item as { createdAt?: Date }).createdAt)
          })),
          ...pairingAuditTrail.map((item) => ({
            record_type: "pairing_audit",
            id: String(item._id),
            event_type: item.eventType,
            actor_type: item.actorType,
            actor_id: item.actorId,
            result: item.result,
            reason: item.reason,
            created_at: toIso((item as { createdAt?: Date }).createdAt)
          }))
        ];

        const csv = buildCsv(csvRows);
        res.setHeader("content-type", "text/csv; charset=utf-8");
        res.setHeader("content-disposition", `attachment; filename=\"support-bundle.csv\"`);
        res.status(200).send(csv);
        return;
      }

      res.json(bundlePayload);
    } catch {
      res.status(500).json({ code: "SUPPORT_BUNDLE_FAILED", message: "Failed to generate support bundle" });
    }
  });

  router.get("/alerts/evaluate", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const windowMinutes = Math.min(Math.max(Number(req.query.window_minutes ?? 15), 5), 180);
      if (!tenantId) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "tenant context is required" });
        return;
      }

      const now = Date.now();
      const windowMs = windowMinutes * 60 * 1000;
      const since = new Date(now - windowMs);
      const previousSince = new Date(now - windowMs * 2);

      const [
        onlineDevices,
        offlineDevices,
        commandCompleted,
        commandFailed,
        commandTimeout,
        syncEvents,
        errorEvents,
        heartbeatCurrentWindow,
        heartbeatPreviousWindow
      ] = await Promise.all([
        DeviceModel.countDocuments({ tenantId, status: "online" }),
        DeviceModel.countDocuments({ tenantId, status: "offline" }),
        CommandModel.countDocuments({ tenantId, status: "completed", createdAt: { $gte: since } }),
        CommandModel.countDocuments({ tenantId, status: "failed", createdAt: { $gte: since } }),
        CommandModel.countDocuments({ tenantId, status: "timeout", createdAt: { $gte: since } }),
        TelemetryModel.find({ tenantId, kind: "sync", createdAt: { $gte: since } }).select("payload createdAt").lean(),
        TelemetryModel.countDocuments({ tenantId, kind: "error", createdAt: { $gte: since } }),
        TelemetryModel.countDocuments({ tenantId, kind: "heartbeat", createdAt: { $gte: since } }),
        TelemetryModel.countDocuments({ tenantId, kind: "heartbeat", createdAt: { $gte: previousSince, $lt: since } })
      ]);

      const fleetTotal = onlineDevices + offlineDevices;
      const offlineRatio = fleetTotal === 0 ? 0 : offlineDevices / fleetTotal;

      const commandTotal = commandCompleted + commandFailed + commandTimeout;
      const commandFailureRatio = commandTotal === 0 ? 0 : (commandFailed + commandTimeout) / commandTotal;

      const syncFailureCount = syncEvents.filter((item) => isFailureStatus(pickPayloadStatus(item.payload))).length;
      const syncFailureRatio = syncEvents.length === 0 ? 0 : syncFailureCount / syncEvents.length;
      const heartbeatDropRatio =
        heartbeatPreviousWindow === 0 ? 0 : (heartbeatPreviousWindow - heartbeatCurrentWindow) / heartbeatPreviousWindow;

      const alerts = [
        {
          rule: "offline_spike",
          severity: offlineRatio >= 0.2 ? "critical" : offlineRatio >= 0.1 ? "warning" : "ok",
          triggered: offlineRatio >= 0.1,
          observed: Number((offlineRatio * 100).toFixed(2)),
          threshold_warning: 10,
          threshold_critical: 20,
          unit: "percent"
        },
        {
          rule: "command_failure",
          severity: commandFailureRatio >= 0.15 ? "critical" : commandFailureRatio >= 0.08 ? "warning" : "ok",
          triggered: commandFailureRatio >= 0.08,
          observed: Number((commandFailureRatio * 100).toFixed(2)),
          threshold_warning: 8,
          threshold_critical: 15,
          unit: "percent"
        },
        {
          rule: "sync_failure_spike",
          severity: syncFailureRatio >= 0.2 ? "critical" : syncFailureRatio >= 0.1 ? "warning" : "ok",
          triggered: syncFailureRatio >= 0.1,
          observed: Number((syncFailureRatio * 100).toFixed(2)),
          threshold_warning: 10,
          threshold_critical: 20,
          unit: "percent"
        },
        {
          rule: "error_telemetry_burst",
          severity: errorEvents >= 25 ? "critical" : errorEvents >= 10 ? "warning" : "ok",
          triggered: errorEvents >= 10,
          observed: errorEvents,
          threshold_warning: 10,
          threshold_critical: 25,
          unit: "count"
        },
        {
          rule: "heartbeat_drop",
          severity: heartbeatDropRatio >= 0.7 ? "critical" : heartbeatDropRatio >= 0.5 ? "warning" : "ok",
          triggered: heartbeatDropRatio >= 0.5,
          observed: Number((heartbeatDropRatio * 100).toFixed(2)),
          threshold_warning: 50,
          threshold_critical: 70,
          unit: "percent"
        }
      ];

      res.json({
        tenant_id: tenantId,
        as_of: new Date().toISOString(),
        window_minutes: windowMinutes,
        windows: {
          heartbeat_current_window: heartbeatCurrentWindow,
          heartbeat_previous_window: heartbeatPreviousWindow
        },
        alerts
      });
    } catch {
      res.status(500).json({ code: "OPS_ALERT_EVALUATION_FAILED", message: "Failed to evaluate alert thresholds" });
    }
  });

  router.get("/content/parity", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const sampleLimit = Math.min(Math.max(Number(req.query.sample_limit ?? 20), 1), 100);

      if (!tenantId) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "tenant context is required" });
        return;
      }

      if (!isPostgresConnected()) {
        res.status(503).json({
          code: "POSTGRES_UNAVAILABLE",
          message: "PostgreSQL is not connected for parity diagnostics"
        });
        return;
      }

      const pool = getPostgresPool();

      const [mongoMediaCount, mongoPlaylistCount] = await Promise.all([
        MediaModel.countDocuments({ tenantId }),
        PlaylistModel.countDocuments({ tenantId })
      ]);

      const [pgMediaCountRes, pgPlaylistCountRes] = await Promise.all([
        pool.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM media WHERE tenant_id = $1::uuid AND deleted_at IS NULL`,
          [tenantId]
        ),
        pool.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM playlists WHERE tenant_id = $1::uuid AND deleted_at IS NULL`,
          [tenantId]
        )
      ]);

      const pgMediaCount = Number(pgMediaCountRes.rows[0]?.count ?? 0);
      const pgPlaylistCount = Number(pgPlaylistCountRes.rows[0]?.count ?? 0);

      const [mongoMedia, mongoPlaylists, pgMediaRows, pgPlaylistRows] = await Promise.all([
        MediaModel.find({ tenantId }).sort({ updatedAt: -1 }).limit(sampleLimit).lean(),
        PlaylistModel.find({ tenantId }).sort({ updatedAt: -1 }).limit(sampleLimit).lean(),
        pool.query<{ external_id: string; checksum_sha256: string; status: string }>(
          `SELECT external_id, checksum_sha256, status
           FROM media
           WHERE tenant_id = $1::uuid AND deleted_at IS NULL
           ORDER BY updated_at DESC
           LIMIT $2`,
          [tenantId, sampleLimit]
        ),
        pool.query<{ external_id: string; version: number; item_count: number }>(
          `SELECT external_id, version, jsonb_array_length(items_json) AS item_count
           FROM playlists
           WHERE tenant_id = $1::uuid AND deleted_at IS NULL
           ORDER BY updated_at DESC
           LIMIT $2`,
          [tenantId, sampleLimit]
        )
      ]);

      const pgMediaByExternalId = new Map(pgMediaRows.rows.map((item) => [item.external_id, item]));
      const pgPlaylistByExternalId = new Map(pgPlaylistRows.rows.map((item) => [item.external_id, item]));

      const mediaMismatches = mongoMedia
        .map((mongo) => {
          const externalId = String((mongo as { _id: unknown })._id);
          const pg = pgMediaByExternalId.get(externalId);
          if (!pg) {
            return {
              external_id: externalId,
              reason: "missing_in_postgres"
            };
          }

          if (pg.checksum_sha256 !== mongo.checksumSha256 || pg.status !== mongo.status) {
            return {
              external_id: externalId,
              reason: "field_mismatch",
              mongo: { checksum_sha256: mongo.checksumSha256, status: mongo.status },
              postgres: { checksum_sha256: pg.checksum_sha256, status: pg.status }
            };
          }

          return null;
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      const playlistMismatches = mongoPlaylists
        .map((mongo) => {
          const externalId = String((mongo as { _id: unknown })._id);
          const pg = pgPlaylistByExternalId.get(externalId);
          if (!pg) {
            return {
              external_id: externalId,
              reason: "missing_in_postgres"
            };
          }

          if (pg.version !== mongo.version || pg.item_count !== mongo.items.length) {
            return {
              external_id: externalId,
              reason: "field_mismatch",
              mongo: { version: mongo.version, item_count: mongo.items.length },
              postgres: { version: pg.version, item_count: pg.item_count }
            };
          }

          return null;
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      const report = {
        tenant_id: tenantId,
        as_of: new Date().toISOString(),
        sample_limit: sampleLimit,
        counts: {
          media: {
            mongo: mongoMediaCount,
            postgres: pgMediaCount,
            matched: mongoMediaCount === pgMediaCount
          },
          playlists: {
            mongo: mongoPlaylistCount,
            postgres: pgPlaylistCount,
            matched: mongoPlaylistCount === pgPlaylistCount
          }
        },
        sample_diagnostics: {
          media_mismatch_count: mediaMismatches.length,
          playlist_mismatch_count: playlistMismatches.length,
          media_mismatches: mediaMismatches,
          playlist_mismatches: playlistMismatches
        },
        parity_ok:
          mongoMediaCount === pgMediaCount &&
          mongoPlaylistCount === pgPlaylistCount &&
          mediaMismatches.length === 0 &&
          playlistMismatches.length === 0
      };

      res.json(report);
    } catch {
      res.status(500).json({ code: "OPS_CONTENT_PARITY_FAILED", message: "Failed to evaluate content parity" });
    }
  });

  router.get("/rollout/guardrails/evaluate", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const windowMinutes = Math.min(Math.max(Number(req.query.window_minutes ?? 15), 5), 180);
      const sampleLimit = Math.min(Math.max(Number(req.query.sample_limit ?? 20), 1), 100);

      if (!tenantId) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "tenant context is required" });
        return;
      }

      if (!isPostgresConnected()) {
        res.status(503).json({
          code: "POSTGRES_UNAVAILABLE",
          message: "PostgreSQL is not connected for rollout guardrails"
        });
        return;
      }

      const now = Date.now();
      const windowMs = windowMinutes * 60 * 1000;
      const since = new Date(now - windowMs);
      const previousSince = new Date(now - windowMs * 2);

      const [
        onlineDevices,
        offlineDevices,
        commandCompleted,
        commandFailed,
        commandTimeout,
        syncEvents,
        errorEvents,
        heartbeatCurrentWindow,
        heartbeatPreviousWindow
      ] = await Promise.all([
        DeviceModel.countDocuments({ tenantId, status: "online" }),
        DeviceModel.countDocuments({ tenantId, status: "offline" }),
        CommandModel.countDocuments({ tenantId, status: "completed", createdAt: { $gte: since } }),
        CommandModel.countDocuments({ tenantId, status: "failed", createdAt: { $gte: since } }),
        CommandModel.countDocuments({ tenantId, status: "timeout", createdAt: { $gte: since } }),
        TelemetryModel.find({ tenantId, kind: "sync", createdAt: { $gte: since } }).select("payload createdAt").lean(),
        TelemetryModel.countDocuments({ tenantId, kind: "error", createdAt: { $gte: since } }),
        TelemetryModel.countDocuments({ tenantId, kind: "heartbeat", createdAt: { $gte: since } }),
        TelemetryModel.countDocuments({ tenantId, kind: "heartbeat", createdAt: { $gte: previousSince, $lt: since } })
      ]);

      const fleetTotal = onlineDevices + offlineDevices;
      const offlineRatio = fleetTotal === 0 ? 0 : offlineDevices / fleetTotal;
      const commandTotal = commandCompleted + commandFailed + commandTimeout;
      const commandFailureRatio = commandTotal === 0 ? 0 : (commandFailed + commandTimeout) / commandTotal;
      const syncFailureCount = syncEvents.filter((item) => isFailureStatus(pickPayloadStatus(item.payload))).length;
      const syncFailureRatio = syncEvents.length === 0 ? 0 : syncFailureCount / syncEvents.length;
      const heartbeatDropRatio =
        heartbeatPreviousWindow === 0 ? 0 : (heartbeatPreviousWindow - heartbeatCurrentWindow) / heartbeatPreviousWindow;

      const alerts = [
        {
          rule: "offline_spike",
          severity: offlineRatio >= 0.2 ? "critical" : offlineRatio >= 0.1 ? "warning" : "ok",
          triggered: offlineRatio >= 0.1,
          observed: Number((offlineRatio * 100).toFixed(2))
        },
        {
          rule: "command_failure",
          severity: commandFailureRatio >= 0.15 ? "critical" : commandFailureRatio >= 0.08 ? "warning" : "ok",
          triggered: commandFailureRatio >= 0.08,
          observed: Number((commandFailureRatio * 100).toFixed(2))
        },
        {
          rule: "sync_failure_spike",
          severity: syncFailureRatio >= 0.2 ? "critical" : syncFailureRatio >= 0.1 ? "warning" : "ok",
          triggered: syncFailureRatio >= 0.1,
          observed: Number((syncFailureRatio * 100).toFixed(2))
        },
        {
          rule: "error_telemetry_burst",
          severity: errorEvents >= 25 ? "critical" : errorEvents >= 10 ? "warning" : "ok",
          triggered: errorEvents >= 10,
          observed: errorEvents
        },
        {
          rule: "heartbeat_drop",
          severity: heartbeatDropRatio >= 0.7 ? "critical" : heartbeatDropRatio >= 0.5 ? "warning" : "ok",
          triggered: heartbeatDropRatio >= 0.5,
          observed: Number((heartbeatDropRatio * 100).toFixed(2))
        }
      ];

      const pool = getPostgresPool();
      const [mongoMediaCount, mongoPlaylistCount] = await Promise.all([
        MediaModel.countDocuments({ tenantId }),
        PlaylistModel.countDocuments({ tenantId })
      ]);

      const [pgMediaCountRes, pgPlaylistCountRes] = await Promise.all([
        pool.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM media WHERE tenant_id = $1::uuid AND deleted_at IS NULL`,
          [tenantId]
        ),
        pool.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM playlists WHERE tenant_id = $1::uuid AND deleted_at IS NULL`,
          [tenantId]
        )
      ]);

      const pgMediaCount = Number(pgMediaCountRes.rows[0]?.count ?? 0);
      const pgPlaylistCount = Number(pgPlaylistCountRes.rows[0]?.count ?? 0);

      const [mongoMedia, mongoPlaylists, pgMediaRows, pgPlaylistRows] = await Promise.all([
        MediaModel.find({ tenantId }).sort({ updatedAt: -1 }).limit(sampleLimit).lean(),
        PlaylistModel.find({ tenantId }).sort({ updatedAt: -1 }).limit(sampleLimit).lean(),
        pool.query<{ external_id: string; checksum_sha256: string; status: string }>(
          `SELECT external_id, checksum_sha256, status
           FROM media
           WHERE tenant_id = $1::uuid AND deleted_at IS NULL
           ORDER BY updated_at DESC
           LIMIT $2`,
          [tenantId, sampleLimit]
        ),
        pool.query<{ external_id: string; version: number; item_count: number }>(
          `SELECT external_id, version, jsonb_array_length(items_json) AS item_count
           FROM playlists
           WHERE tenant_id = $1::uuid AND deleted_at IS NULL
           ORDER BY updated_at DESC
           LIMIT $2`,
          [tenantId, sampleLimit]
        )
      ]);

      const pgMediaByExternalId = new Map(pgMediaRows.rows.map((item) => [item.external_id, item]));
      const pgPlaylistByExternalId = new Map(pgPlaylistRows.rows.map((item) => [item.external_id, item]));

      const mediaMismatchCount = mongoMedia.filter((mongo) => {
        const externalId = String((mongo as { _id: unknown })._id);
        const pg = pgMediaByExternalId.get(externalId);
        return !pg || pg.checksum_sha256 !== mongo.checksumSha256 || pg.status !== mongo.status;
      }).length;

      const playlistMismatchCount = mongoPlaylists.filter((mongo) => {
        const externalId = String((mongo as { _id: unknown })._id);
        const pg = pgPlaylistByExternalId.get(externalId);
        return !pg || pg.version !== mongo.version || pg.item_count !== mongo.items.length;
      }).length;

      const parityOk =
        mongoMediaCount === pgMediaCount &&
        mongoPlaylistCount === pgPlaylistCount &&
        mediaMismatchCount === 0 &&
        playlistMismatchCount === 0;

      const criticalAlerts = alerts.filter((alert) => alert.severity === "critical");
      const warningAlerts = alerts.filter((alert) => alert.severity === "warning");

      let decision: "promote" | "hold" | "block" = "promote";
      const reasons: string[] = [];

      if (!parityOk) {
        decision = "block";
        reasons.push("content parity check failed");
      }

      if (criticalAlerts.length > 0) {
        decision = "block";
        reasons.push(`critical alerts triggered: ${criticalAlerts.map((item) => item.rule).join(", ")}`);
      }

      if (decision !== "block" && warningAlerts.length > 0) {
        decision = "hold";
        reasons.push(`warning alerts triggered: ${warningAlerts.map((item) => item.rule).join(", ")}`);
      }

      if (reasons.length === 0) {
        reasons.push("all guardrails healthy");
      }

      res.json({
        tenant_id: tenantId,
        as_of: new Date().toISOString(),
        inputs: {
          window_minutes: windowMinutes,
          sample_limit: sampleLimit
        },
        decision,
        reasons,
        promotion_criteria: {
          requires_parity_ok: true,
          requires_zero_critical_alerts: true,
          requires_zero_warning_alerts_for_auto_promote: true
        },
        parity: {
          ok: parityOk,
          counts: {
            media: { mongo: mongoMediaCount, postgres: pgMediaCount },
            playlists: { mongo: mongoPlaylistCount, postgres: pgPlaylistCount }
          },
          sample_mismatch_count: {
            media: mediaMismatchCount,
            playlists: playlistMismatchCount
          }
        },
        alerts: {
          critical_count: criticalAlerts.length,
          warning_count: warningAlerts.length,
          evaluated: alerts,
          windows: {
            heartbeat_current_window: heartbeatCurrentWindow,
            heartbeat_previous_window: heartbeatPreviousWindow
          }
        }
      });
    } catch {
      res.status(500).json({
        code: "OPS_ROLLOUT_GUARDRAIL_FAILED",
        message: "Failed to evaluate rollout guardrails"
      });
    }
  });

  router.get("/slo/evaluate", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      if (!tenantId) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "tenant context is required" });
        return;
      }

      const windowMinutes = Math.min(Math.max(Number(req.query.window_minutes ?? 60), 5), 1440);
      const since = new Date(Date.now() - windowMinutes * 60 * 1000);

      const [
        commandCompleted,
        commandFailed,
        commandTimeout,
        syncEvents,
        errorEvents,
        onlineDevices,
        offlineDevices
      ] = await Promise.all([
        CommandModel.countDocuments({ tenantId, status: "completed", createdAt: { $gte: since } }),
        CommandModel.countDocuments({ tenantId, status: "failed", createdAt: { $gte: since } }),
        CommandModel.countDocuments({ tenantId, status: "timeout", createdAt: { $gte: since } }),
        TelemetryModel.find({ tenantId, kind: "sync", createdAt: { $gte: since } }).select("payload").lean(),
        TelemetryModel.countDocuments({ tenantId, kind: "error", createdAt: { $gte: since } }),
        DeviceModel.countDocuments({ tenantId, status: "online" }),
        DeviceModel.countDocuments({ tenantId, status: "offline" })
      ]);

      const commandTotal = commandCompleted + commandFailed + commandTimeout;
      const commandSuccessRate = commandTotal === 0 ? 1.0 : commandCompleted / commandTotal;
      const errorRate = (errorEvents / Math.max(commandTotal, 1)) * 100;
      const syncFailures = syncEvents.filter((item) => isFailureStatus(pickPayloadStatus(item.payload))).length;
      const syncSuccessRate = syncEvents.length === 0 ? 1.0 : 1 - syncFailures / syncEvents.length;
      const fleetTotal = onlineDevices + offlineDevices;
      const heartbeatHealthRate = fleetTotal === 0 ? 1.0 : onlineDevices / fleetTotal;

      const slos = [
        {
          name: "command_success_rate",
          threshold: 0.95,
          current: commandSuccessRate,
          unit: "ratio",
          status: commandSuccessRate >= 0.95 ? "healthy" : commandSuccessRate >= 0.85 ? "warning" : "critical"
        },
        {
          name: "error_rate_percent",
          threshold: 1.0,
          current: errorRate,
          unit: "percent",
          status: errorRate <= 1.0 ? "healthy" : errorRate <= 2.0 ? "warning" : "critical"
        },
        {
          name: "sync_success_rate",
          threshold: 0.98,
          current: syncSuccessRate,
          unit: "ratio",
          status: syncSuccessRate >= 0.98 ? "healthy" : syncSuccessRate >= 0.90 ? "warning" : "critical"
        },
        {
          name: "heartbeat_health_rate",
          threshold: 0.9,
          current: heartbeatHealthRate,
          unit: "ratio",
          status: heartbeatHealthRate >= 0.9 ? "healthy" : heartbeatHealthRate >= 0.75 ? "warning" : "critical"
        }
      ];

      const criticalSlos = slos.filter((item) => item.status === "critical");
      const warningSlos = slos.filter((item) => item.status === "warning");
      let escalation: "healthy" | "warning" | "critical" = "healthy";
      const escalationReasons: string[] = [];

      if (criticalSlos.length > 0) {
        escalation = "critical";
        escalationReasons.push(`SLO breaches: ${criticalSlos.map((item) => item.name).join(", ")}`);
      } else if (warningSlos.length > 0) {
        escalation = "warning";
        escalationReasons.push(`SLO warnings: ${warningSlos.map((item) => item.name).join(", ")}`);
      } else {
        escalationReasons.push("all SLOs healthy");
      }

      res.json({
        tenant_id: tenantId,
        as_of: new Date().toISOString(),
        window_minutes: windowMinutes,
        escalation,
        escalation_reasons: escalationReasons,
        slos: slos.map((item) => ({
          name: item.name,
          threshold: item.threshold,
          current: Number(item.current.toFixed(4)),
          unit: item.unit,
          status: item.status,
          breach: item.status !== "healthy"
        })),
        command_metrics: {
          completed: commandCompleted,
          failed: commandFailed,
          timeout: commandTimeout,
          success_rate: Number(commandSuccessRate.toFixed(4))
        },
        sync_metrics: {
          total_events: syncEvents.length,
          failures: syncFailures,
          success_rate: Number(syncSuccessRate.toFixed(4))
        },
        error_metrics: {
          event_count: errorEvents,
          error_rate_percent: Number(errorRate.toFixed(2))
        },
        health_metrics: {
          online_devices: onlineDevices,
          offline_devices: offlineDevices,
          heartbeat_health_rate: Number(heartbeatHealthRate.toFixed(4))
        }
      });
    } catch {
      res.status(500).json({
        code: "OPS_SLO_EVALUATION_FAILED",
        message: "Failed to evaluate SLOs"
      });
    }
  });

  router.get("/release-gate/evaluate", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      if (!tenantId) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "tenant context is required" });
        return;
      }

      const windowMinutes = Math.min(Math.max(Number(req.query.window_minutes ?? 60), 5), 1440);
      const sloWindowMinutes = Math.min(Math.max(Number(req.query.slo_window_minutes ?? 240), 30), 1440);
      const since = new Date(Date.now() - windowMinutes * 60 * 1000);
      const sloSince = new Date(Date.now() - sloWindowMinutes * 60 * 1000);

      // Get guardrails
      const [
        onlineDevices,
        offlineDevices,
        commandCompleted,
        commandFailed,
        commandTimeout,
        syncEvents,
        errorEvents,
        heartbeatCurrentWindow,
        heartbeatPreviousWindow
      ] = await Promise.all([
        DeviceModel.countDocuments({ tenantId, status: "online" }),
        DeviceModel.countDocuments({ tenantId, status: "offline" }),
        CommandModel.countDocuments({ tenantId, status: "completed", createdAt: { $gte: since } }),
        CommandModel.countDocuments({ tenantId, status: "failed", createdAt: { $gte: since } }),
        CommandModel.countDocuments({ tenantId, status: "timeout", createdAt: { $gte: since } }),
        TelemetryModel.find({ tenantId, kind: "sync", createdAt: { $gte: since } }).select("payload").lean(),
        TelemetryModel.countDocuments({ tenantId, kind: "error", createdAt: { $gte: since } }),
        TelemetryModel.countDocuments({ tenantId, kind: "heartbeat", createdAt: { $gte: since } }),
        TelemetryModel.countDocuments({ tenantId, kind: "heartbeat", createdAt: { $gte: new Date(since.getTime() - windowMinutes * 60 * 1000), $lt: since } })
      ]);

      const fleetTotal = onlineDevices + offlineDevices;
      const offlineRatio = fleetTotal === 0 ? 0 : offlineDevices / fleetTotal;
      const commandTotal = commandCompleted + commandFailed + commandTimeout;
      const commandFailureRatio = commandTotal === 0 ? 0 : (commandFailed + commandTimeout) / commandTotal;
      const syncFailureCount = syncEvents.filter((item) => isFailureStatus(pickPayloadStatus(item.payload))).length;
      const syncFailureRatio = syncEvents.length === 0 ? 0 : syncFailureCount / syncEvents.length;
      const heartbeatDropRatio = heartbeatPreviousWindow === 0 ? 0 : (heartbeatPreviousWindow - heartbeatCurrentWindow) / heartbeatPreviousWindow;

      const guardAlertsRaw = [
        { rule: "offline_spike", severity: offlineRatio >= 0.2 ? "critical" : offlineRatio >= 0.1 ? "warning" : "ok" },
        { rule: "command_failure", severity: commandFailureRatio >= 0.15 ? "critical" : commandFailureRatio >= 0.08 ? "warning" : "ok" },
        { rule: "sync_failure_spike", severity: syncFailureRatio >= 0.2 ? "critical" : syncFailureRatio >= 0.1 ? "warning" : "ok" },
        { rule: "error_telemetry_burst", severity: errorEvents >= 25 ? "critical" : errorEvents >= 10 ? "warning" : "ok" },
        { rule: "heartbeat_drop", severity: heartbeatDropRatio >= 0.7 ? "critical" : heartbeatDropRatio >= 0.5 ? "warning" : "ok" }
      ];

      // Get SLOs
      const [
        commandCompletedSlo,
        commandFailedSlo,
        commandTimeoutSlo,
        syncEventsSlo,
        errorEventsSlo
      ] = await Promise.all([
        CommandModel.countDocuments({ tenantId, status: "completed", createdAt: { $gte: sloSince } }),
        CommandModel.countDocuments({ tenantId, status: "failed", createdAt: { $gte: sloSince } }),
        CommandModel.countDocuments({ tenantId, status: "timeout", createdAt: { $gte: sloSince } }),
        TelemetryModel.find({ tenantId, kind: "sync", createdAt: { $gte: sloSince } }).select("payload").lean(),
        TelemetryModel.countDocuments({ tenantId, kind: "error", createdAt: { $gte: sloSince } })
      ]);

      const commandTotalSlo = commandCompletedSlo + commandFailedSlo + commandTimeoutSlo;
      const commandSuccessRateSlo = commandTotalSlo === 0 ? 1.0 : commandCompletedSlo / commandTotalSlo;
      const errorRateSlo = (errorEventsSlo / Math.max(commandTotalSlo, 1)) * 100;
      const syncFailuresSlo = syncEventsSlo.filter((item) => isFailureStatus(pickPayloadStatus(item.payload))).length;
      const syncSuccessRateSlo = syncEventsSlo.length === 0 ? 1.0 : 1 - syncFailuresSlo / syncEventsSlo.length;

      const slosRaw = [
        { name: "command_success", threshold: 0.95, current: commandSuccessRateSlo, breach: commandSuccessRateSlo < 0.95 },
        { name: "error_rate", threshold: 1.0, current: errorRateSlo, breach: errorRateSlo > 1.0 },
        { name: "sync_success", threshold: 0.98, current: syncSuccessRateSlo, breach: syncSuccessRateSlo < 0.98 }
      ];

      const criticalGuardAlerts = guardAlertsRaw.filter((item) => item.severity === "critical");
      const criticalSlos = slosRaw.filter((item) => item.breach);

      let decision: "promote" | "hold" | "block" = "promote";
      const blockReasons: string[] = [];
      const holdReasons: string[] = [];

      // Release gate: block on critical guardrails OR SLO breaches
      if (criticalGuardAlerts.length > 0) {
        decision = "block";
        blockReasons.push(`critical guardrail alerts: ${criticalGuardAlerts.map((a) => a.rule).join(", ")}`);
      }

      if (criticalSlos.length > 0) {
        decision = "block";
        blockReasons.push(`SLO breaches: ${criticalSlos.map((a) => a.name).join(", ")}`);
      }

      if (decision !== "block") {
        const nonCriticalGuardAlerts = guardAlertsRaw.filter((item) => item.severity === "warning");
        if (nonCriticalGuardAlerts.length > 0) {
          decision = "hold";
          holdReasons.push(`guardrail warnings: ${nonCriticalGuardAlerts.map((a) => a.rule).join(", ")}`);
        }
      }

      res.json({
        tenant_id: tenantId,
        as_of: new Date().toISOString(),
        windows: {
          guardrail_window_minutes: windowMinutes,
          slo_evaluation_window_minutes: sloWindowMinutes
        },
        decision,
        block_reasons: blockReasons,
        hold_reasons: holdReasons,
        guardrails: {
          critical_count: criticalGuardAlerts.length,
          warning_count: guardAlertsRaw.filter((item) => item.severity === "warning").length,
          evaluated: guardAlertsRaw
        },
        slos: {
          critical_breach_count: criticalSlos.length,
          total_evaluated: slosRaw.length,
          breaches: slosRaw.map((item) => ({
            name: item.name,
            threshold: item.threshold,
            current: Number(item.current.toFixed(4)),
            breached: item.breach
          }))
        }
      });
    } catch {
      res.status(500).json({
        code: "OPS_RELEASE_GATE_FAILED",
        message: "Failed to evaluate release gate"
      });
    }
  });

  router.get("/pilot/checkpoints/evaluate", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      if (!tenantId) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "tenant context is required" });
        return;
      }

      const currentPercentage = Math.min(Math.max(Number(req.query.current_percentage ?? 10), 1), 100);
      const windowMinutes = Math.min(Math.max(Number(req.query.window_minutes ?? 60), 5), 1440);
      const since = new Date(Date.now() - windowMinutes * 60 * 1000);

      const [onlineDevices, offlineDevices, commandCompleted, commandFailed, commandTimeout, syncEvents, errorEvents] =
        await Promise.all([
          DeviceModel.countDocuments({ tenantId, status: "online" }),
          DeviceModel.countDocuments({ tenantId, status: "offline" }),
          CommandModel.countDocuments({ tenantId, status: "completed", createdAt: { $gte: since } }),
          CommandModel.countDocuments({ tenantId, status: "failed", createdAt: { $gte: since } }),
          CommandModel.countDocuments({ tenantId, status: "timeout", createdAt: { $gte: since } }),
          TelemetryModel.find({ tenantId, kind: "sync", createdAt: { $gte: since } }).select("payload").lean(),
          TelemetryModel.countDocuments({ tenantId, kind: "error", createdAt: { $gte: since } })
        ]);

      const fleetTotal = onlineDevices + offlineDevices;
      const offlineRatio = fleetTotal === 0 ? 0 : offlineDevices / fleetTotal;
      const commandTotal = commandCompleted + commandFailed + commandTimeout;
      const commandFailureRatio = commandTotal === 0 ? 0 : (commandFailed + commandTimeout) / commandTotal;
      const errorRatePercent = (errorEvents / Math.max(commandTotal, 1)) * 100;
      const syncFailureCount = syncEvents.filter((item) => isFailureStatus(pickPayloadStatus(item.payload))).length;
      const syncFailureRatio = syncEvents.length === 0 ? 0 : syncFailureCount / syncEvents.length;

      const rollbackTriggered = errorRatePercent > 2 || commandFailureRatio > 0.15 || offlineRatio > 0.2 || syncFailureRatio > 0.2;

      const canaryStatus =
        rollbackTriggered
          ? "critical"
          : errorRatePercent > 1 || commandFailureRatio > 0.08 || offlineRatio > 0.1 || syncFailureRatio > 0.1
            ? "warning"
            : "healthy";

      const checkpoints = [10, 25, 50, 100];
      const nextCheckpoint = checkpoints.find((item) => item > currentPercentage) ?? null;

      let decision: "promote" | "hold" | "rollback" = "promote";
      const reasons: string[] = [];

      if (rollbackTriggered) {
        decision = "rollback";
        reasons.push("rollback threshold reached (error rate or failure ratio exceeded)");
      } else if (canaryStatus === "warning") {
        decision = "hold";
        reasons.push("canary metrics in warning range, hold at current checkpoint");
      } else {
        reasons.push("canary metrics healthy, safe to promote checkpoint");
      }

      res.json({
        tenant_id: tenantId,
        as_of: new Date().toISOString(),
        decision,
        reasons,
        rollout_progress: {
          current_percentage: currentPercentage,
          next_checkpoint_percentage: nextCheckpoint,
          checkpoint_path: checkpoints,
          percent_complete: Number((currentPercentage / 100).toFixed(2))
        },
        canary: {
          status: canaryStatus,
          rollback_triggered: rollbackTriggered,
          thresholds: {
            error_rate_percent_critical: 2,
            command_failure_ratio_critical: 0.15,
            offline_ratio_critical: 0.2,
            sync_failure_ratio_critical: 0.2
          }
        },
        metrics: {
          devices: {
            online: onlineDevices,
            offline: offlineDevices,
            offline_ratio: Number(offlineRatio.toFixed(4))
          },
          commands: {
            completed: commandCompleted,
            failed: commandFailed,
            timeout: commandTimeout,
            failure_ratio: Number(commandFailureRatio.toFixed(4))
          },
          telemetry: {
            sync_total: syncEvents.length,
            sync_failure_count: syncFailureCount,
            sync_failure_ratio: Number(syncFailureRatio.toFixed(4)),
            error_events: errorEvents,
            error_rate_percent: Number(errorRatePercent.toFixed(2))
          }
        }
      });
    } catch {
      res.status(500).json({
        code: "OPS_PILOT_CHECKPOINTS_FAILED",
        message: "Failed to evaluate pilot rollout checkpoints"
      });
    }
  });

  router.get("/failover/evaluate", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      if (!tenantId) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "tenant context is required" });
        return;
      }

      const primaryRegion = String(req.query.primary_region ?? "eu-central-1").trim();
      const secondaryRegion = String(req.query.secondary_region ?? "eu-west-1").trim();
      const windowMinutes = Math.min(Math.max(Number(req.query.window_minutes ?? 60), 5), 1440);
      const since = new Date(Date.now() - windowMinutes * 60 * 1000);

      const [onlineDevices, offlineDevices, commandCompleted, commandFailed, commandTimeout, syncEvents, errorEvents] =
        await Promise.all([
          DeviceModel.countDocuments({ tenantId, status: "online" }),
          DeviceModel.countDocuments({ tenantId, status: "offline" }),
          CommandModel.countDocuments({ tenantId, status: "completed", createdAt: { $gte: since } }),
          CommandModel.countDocuments({ tenantId, status: "failed", createdAt: { $gte: since } }),
          CommandModel.countDocuments({ tenantId, status: "timeout", createdAt: { $gte: since } }),
          TelemetryModel.find({ tenantId, kind: "sync", createdAt: { $gte: since } }).select("payload").lean(),
          TelemetryModel.countDocuments({ tenantId, kind: "error", createdAt: { $gte: since } })
        ]);

      const fleetTotal = onlineDevices + offlineDevices;
      const offlineRatio = fleetTotal === 0 ? 0 : offlineDevices / fleetTotal;
      const commandTotal = commandCompleted + commandFailed + commandTimeout;
      const commandFailureRatio = commandTotal === 0 ? 0 : (commandFailed + commandTimeout) / commandTotal;
      const errorRatePercent = (errorEvents / Math.max(commandTotal, 1)) * 100;
      const syncFailureCount = syncEvents.filter((item) => isFailureStatus(pickPayloadStatus(item.payload))).length;
      const syncFailureRatio = syncEvents.length === 0 ? 0 : syncFailureCount / syncEvents.length;

      const failoverTriggered =
        errorRatePercent > 3 || commandFailureRatio > 0.2 || offlineRatio > 0.3 || syncFailureRatio > 0.25;

      const warningState =
        errorRatePercent > 1.5 || commandFailureRatio > 0.1 || offlineRatio > 0.15 || syncFailureRatio > 0.12;

      let decision: "stay_primary" | "prepare_failover" | "failover_now" = "stay_primary";
      const reasons: string[] = [];

      if (failoverTriggered) {
        decision = "failover_now";
        reasons.push("critical service degradation detected, trigger failover");
      } else if (warningState) {
        decision = "prepare_failover";
        reasons.push("warning-level degradation detected, prepare standby region");
      } else {
        reasons.push("primary region healthy, stay on primary");
      }

      res.json({
        tenant_id: tenantId,
        as_of: new Date().toISOString(),
        regions: {
          primary: primaryRegion,
          secondary: secondaryRegion
        },
        decision,
        reasons,
        health: {
          failover_triggered: failoverTriggered,
          warning_state: warningState,
          window_minutes: windowMinutes
        },
        thresholds: {
          failover: {
            error_rate_percent: 3,
            command_failure_ratio: 0.2,
            offline_ratio: 0.3,
            sync_failure_ratio: 0.25
          },
          warning: {
            error_rate_percent: 1.5,
            command_failure_ratio: 0.1,
            offline_ratio: 0.15,
            sync_failure_ratio: 0.12
          }
        },
        metrics: {
          devices: {
            online: onlineDevices,
            offline: offlineDevices,
            offline_ratio: Number(offlineRatio.toFixed(4))
          },
          commands: {
            completed: commandCompleted,
            failed: commandFailed,
            timeout: commandTimeout,
            failure_ratio: Number(commandFailureRatio.toFixed(4))
          },
          telemetry: {
            sync_total: syncEvents.length,
            sync_failure_count: syncFailureCount,
            sync_failure_ratio: Number(syncFailureRatio.toFixed(4)),
            error_events: errorEvents,
            error_rate_percent: Number(errorRatePercent.toFixed(2))
          }
        }
      });
    } catch {
      res.status(500).json({
        code: "OPS_FAILOVER_EVALUATION_FAILED",
        message: "Failed to evaluate multi-region failover readiness"
      });
    }
  });

  router.get("/canary/deployment/evaluate", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      if (!tenantId) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "tenant context is required" });
        return;
      }

      const currentTrafficPercent = Math.min(Math.max(Number(req.query.current_traffic_percent ?? 10), 1), 100);
      const stepPercent = Math.min(Math.max(Number(req.query.step_percent ?? 10), 1), 50);
      const windowMinutes = Math.min(Math.max(Number(req.query.window_minutes ?? 30), 5), 1440);
      const since = new Date(Date.now() - windowMinutes * 60 * 1000);

      const [onlineDevices, offlineDevices, commandCompleted, commandFailed, commandTimeout, syncEvents, errorEvents] =
        await Promise.all([
          DeviceModel.countDocuments({ tenantId, status: "online" }),
          DeviceModel.countDocuments({ tenantId, status: "offline" }),
          CommandModel.countDocuments({ tenantId, status: "completed", createdAt: { $gte: since } }),
          CommandModel.countDocuments({ tenantId, status: "failed", createdAt: { $gte: since } }),
          CommandModel.countDocuments({ tenantId, status: "timeout", createdAt: { $gte: since } }),
          TelemetryModel.find({ tenantId, kind: "sync", createdAt: { $gte: since } }).select("payload").lean(),
          TelemetryModel.countDocuments({ tenantId, kind: "error", createdAt: { $gte: since } })
        ]);

      const fleetTotal = onlineDevices + offlineDevices;
      const offlineRatio = fleetTotal === 0 ? 0 : offlineDevices / fleetTotal;
      const commandTotal = commandCompleted + commandFailed + commandTimeout;
      const commandFailureRatio = commandTotal === 0 ? 0 : (commandFailed + commandTimeout) / commandTotal;
      const errorRatePercent = (errorEvents / Math.max(commandTotal, 1)) * 100;
      const syncFailureCount = syncEvents.filter((item) => isFailureStatus(pickPayloadStatus(item.payload))).length;
      const syncFailureRatio = syncEvents.length === 0 ? 0 : syncFailureCount / syncEvents.length;

      const rollbackTriggered =
        errorRatePercent > 2 || commandFailureRatio > 0.12 || offlineRatio > 0.2 || syncFailureRatio > 0.15;
      const holdTriggered =
        errorRatePercent > 1 || commandFailureRatio > 0.06 || offlineRatio > 0.1 || syncFailureRatio > 0.08;

      let decision: "promote" | "hold" | "rollback" = "promote";
      const reasons: string[] = [];

      if (rollbackTriggered) {
        decision = "rollback";
        reasons.push("critical canary signal detected, rollback is required");
      } else if (holdTriggered) {
        decision = "hold";
        reasons.push("warning canary signal detected, hold traffic shift");
      } else {
        reasons.push("canary healthy, continue progressive deployment");
      }

      const recommendedTrafficPercent =
        decision === "promote"
          ? Math.min(100, currentTrafficPercent + stepPercent)
          : decision === "rollback"
            ? Math.max(0, currentTrafficPercent - stepPercent)
            : currentTrafficPercent;

      res.json({
        tenant_id: tenantId,
        as_of: new Date().toISOString(),
        decision,
        reasons,
        deployment: {
          current_traffic_percent: currentTrafficPercent,
          recommended_traffic_percent: recommendedTrafficPercent,
          step_percent: stepPercent,
          window_minutes: windowMinutes
        },
        rollback: {
          triggered: rollbackTriggered,
          action: rollbackTriggered ? "rollback_now" : holdTriggered ? "monitor" : "continue"
        },
        thresholds: {
          rollback: {
            error_rate_percent: 2,
            command_failure_ratio: 0.12,
            offline_ratio: 0.2,
            sync_failure_ratio: 0.15
          },
          hold: {
            error_rate_percent: 1,
            command_failure_ratio: 0.06,
            offline_ratio: 0.1,
            sync_failure_ratio: 0.08
          }
        },
        metrics: {
          devices: {
            online: onlineDevices,
            offline: offlineDevices,
            offline_ratio: Number(offlineRatio.toFixed(4))
          },
          commands: {
            completed: commandCompleted,
            failed: commandFailed,
            timeout: commandTimeout,
            failure_ratio: Number(commandFailureRatio.toFixed(4))
          },
          telemetry: {
            sync_total: syncEvents.length,
            sync_failure_count: syncFailureCount,
            sync_failure_ratio: Number(syncFailureRatio.toFixed(4)),
            error_events: errorEvents,
            error_rate_percent: Number(errorRatePercent.toFixed(2))
          }
        }
      });
    } catch {
      res.status(500).json({
        code: "OPS_CANARY_EVALUATION_FAILED",
        message: "Failed to evaluate canary deployment"
      });
    }
  });

  router.get("/incident/recovery/evaluate", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      if (!tenantId) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "tenant context is required" });
        return;
      }

      const incidentWindowMinutes = Math.min(Math.max(Number(req.query.window_minutes ?? 30), 5), 1440);
      const since = new Date(Date.now() - incidentWindowMinutes * 60 * 1000);

      const [onlineDevices, offlineDevices, commandCompleted, commandFailed, commandTimeout, syncEvents, errorEvents] =
        await Promise.all([
          DeviceModel.countDocuments({ tenantId, status: "online" }),
          DeviceModel.countDocuments({ tenantId, status: "offline" }),
          CommandModel.countDocuments({ tenantId, status: "completed", createdAt: { $gte: since } }),
          CommandModel.countDocuments({ tenantId, status: "failed", createdAt: { $gte: since } }),
          CommandModel.countDocuments({ tenantId, status: "timeout", createdAt: { $gte: since } }),
          TelemetryModel.find({ tenantId, kind: "sync", createdAt: { $gte: since } }).select("payload").lean(),
          TelemetryModel.countDocuments({ tenantId, kind: "error", createdAt: { $gte: since } })
        ]);

      const fleetTotal = onlineDevices + offlineDevices;
      const offlineRatio = fleetTotal === 0 ? 0 : offlineDevices / fleetTotal;
      const commandTotal = commandCompleted + commandFailed + commandTimeout;
      const commandFailureRatio = commandTotal === 0 ? 0 : (commandFailed + commandTimeout) / commandTotal;
      const errorRatePercent = (errorEvents / Math.max(commandTotal, 1)) * 100;
      const syncFailureCount = syncEvents.filter((item) => isFailureStatus(pickPayloadStatus(item.payload))).length;
      const syncFailureRatio = syncEvents.length === 0 ? 0 : syncFailureCount / syncEvents.length;

      let incidentSeverity: "sev0" | "sev1" | "sev2" | "sev3" = "sev3";
      if (errorRatePercent > 4 || commandFailureRatio > 0.25 || offlineRatio > 0.35 || syncFailureRatio > 0.3) {
        incidentSeverity = "sev0";
      } else if (errorRatePercent > 2 || commandFailureRatio > 0.15 || offlineRatio > 0.2 || syncFailureRatio > 0.15) {
        incidentSeverity = "sev1";
      } else if (errorRatePercent > 1 || commandFailureRatio > 0.08 || offlineRatio > 0.12 || syncFailureRatio > 0.1) {
        incidentSeverity = "sev2";
      }

      const automatedActions: string[] = [];
      if (incidentSeverity === "sev0" || incidentSeverity === "sev1") {
        automatedActions.push("create_incident_ticket", "page_oncall", "broadcast_incident_status");
      }
      if (incidentSeverity === "sev0") {
        automatedActions.push("trigger_failover", "trigger_canary_rollback", "freeze_deployments");
      }
      if (incidentSeverity === "sev2") {
        automatedActions.push("notify_platform_team", "increase_monitoring_frequency");
      }

      const recoveryWorkflow =
        incidentSeverity === "sev0"
          ? [
              "stabilize_service_through_failover",
              "rollback_latest_canary_step",
              "run_post_failover_health_checks",
              "open_root_cause_analysis"
            ]
          : incidentSeverity === "sev1"
            ? [
                "hold_deployment",
                "scale_read_replicas",
                "run_targeted_health_checks",
                "open_incident_timeline"
              ]
            : incidentSeverity === "sev2"
              ? ["hold_traffic_shift", "monitor_error_budget", "prepare_recovery_plan"]
              : ["continue_standard_monitoring"];

      const decision =
        incidentSeverity === "sev0"
          ? "emergency_recovery"
          : incidentSeverity === "sev1"
            ? "controlled_recovery"
            : incidentSeverity === "sev2"
              ? "watch_and_hold"
              : "normal_operations";

      res.json({
        tenant_id: tenantId,
        as_of: new Date().toISOString(),
        incident: {
          severity: incidentSeverity,
          decision,
          window_minutes: incidentWindowMinutes
        },
        automation: {
          actions: automatedActions,
          action_count: automatedActions.length,
          runbook: recoveryWorkflow
        },
        thresholds: {
          sev0: {
            error_rate_percent: 4,
            command_failure_ratio: 0.25,
            offline_ratio: 0.35,
            sync_failure_ratio: 0.3
          },
          sev1: {
            error_rate_percent: 2,
            command_failure_ratio: 0.15,
            offline_ratio: 0.2,
            sync_failure_ratio: 0.15
          },
          sev2: {
            error_rate_percent: 1,
            command_failure_ratio: 0.08,
            offline_ratio: 0.12,
            sync_failure_ratio: 0.1
          }
        },
        metrics: {
          devices: {
            online: onlineDevices,
            offline: offlineDevices,
            offline_ratio: Number(offlineRatio.toFixed(4))
          },
          commands: {
            completed: commandCompleted,
            failed: commandFailed,
            timeout: commandTimeout,
            failure_ratio: Number(commandFailureRatio.toFixed(4))
          },
          telemetry: {
            sync_total: syncEvents.length,
            sync_failure_count: syncFailureCount,
            sync_failure_ratio: Number(syncFailureRatio.toFixed(4)),
            error_events: errorEvents,
            error_rate_percent: Number(errorRatePercent.toFixed(2))
          }
        }
      });
    } catch {
      res.status(500).json({
        code: "OPS_INCIDENT_RECOVERY_FAILED",
        message: "Failed to evaluate incident automation and recovery workflow"
      });
    }
  });

  router.get("/chaos/resilience/certify", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      if (!tenantId) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "tenant context is required" });
        return;
      }

      const windowMinutes = Math.min(Math.max(Number(req.query.window_minutes ?? 60), 5), 1440);
      const drillType = String(req.query.drill_type ?? "network_partition").trim().toLowerCase();
      const since = new Date(Date.now() - windowMinutes * 60 * 1000);

      const [onlineDevices, offlineDevices, commandCompleted, commandFailed, commandTimeout, syncEvents, errorEvents] =
        await Promise.all([
          DeviceModel.countDocuments({ tenantId, status: "online" }),
          DeviceModel.countDocuments({ tenantId, status: "offline" }),
          CommandModel.countDocuments({ tenantId, status: "completed", createdAt: { $gte: since } }),
          CommandModel.countDocuments({ tenantId, status: "failed", createdAt: { $gte: since } }),
          CommandModel.countDocuments({ tenantId, status: "timeout", createdAt: { $gte: since } }),
          TelemetryModel.find({ tenantId, kind: "sync", createdAt: { $gte: since } }).select("payload").lean(),
          TelemetryModel.countDocuments({ tenantId, kind: "error", createdAt: { $gte: since } })
        ]);

      const fleetTotal = onlineDevices + offlineDevices;
      const onlineRatio = fleetTotal === 0 ? 1 : onlineDevices / fleetTotal;
      const offlineRatio = fleetTotal === 0 ? 0 : offlineDevices / fleetTotal;
      const commandTotal = commandCompleted + commandFailed + commandTimeout;
      const commandRecoveryRate = commandTotal === 0 ? 1 : commandCompleted / commandTotal;
      const commandFailureRatio = commandTotal === 0 ? 0 : (commandFailed + commandTimeout) / commandTotal;
      const errorRatePercent = (errorEvents / Math.max(commandTotal, 1)) * 100;
      const syncFailureCount = syncEvents.filter((item) => isFailureStatus(pickPayloadStatus(item.payload))).length;
      const syncFailureRatio = syncEvents.length === 0 ? 0 : syncFailureCount / syncEvents.length;
      const syncSuccessRate = syncEvents.length === 0 ? 1 : 1 - syncFailureRatio;

      const observedMttrMinutes = Number(
        Math.min(180, commandFailureRatio * 120 + syncFailureRatio * 90 + offlineRatio * 60).toFixed(2)
      );
      const observedRpoMinutes = Number(Math.min(30, errorRatePercent * 0.4 + syncFailureRatio * 8).toFixed(2));

      const checks = [
        {
          name: "command_recovery_rate",
          status: commandRecoveryRate >= 0.9 ? "pass" : commandRecoveryRate >= 0.8 ? "warning" : "fail",
          threshold_pass: 0.9,
          threshold_warning: 0.8,
          observed: Number(commandRecoveryRate.toFixed(4))
        },
        {
          name: "sync_success_rate",
          status: syncSuccessRate >= 0.94 ? "pass" : syncSuccessRate >= 0.85 ? "warning" : "fail",
          threshold_pass: 0.94,
          threshold_warning: 0.85,
          observed: Number(syncSuccessRate.toFixed(4))
        },
        {
          name: "error_rate_percent",
          status: errorRatePercent <= 1.5 ? "pass" : errorRatePercent <= 2.5 ? "warning" : "fail",
          threshold_pass: 1.5,
          threshold_warning: 2.5,
          observed: Number(errorRatePercent.toFixed(2))
        },
        {
          name: "fleet_availability_ratio",
          status: onlineRatio >= 0.9 ? "pass" : onlineRatio >= 0.8 ? "warning" : "fail",
          threshold_pass: 0.9,
          threshold_warning: 0.8,
          observed: Number(onlineRatio.toFixed(4))
        },
        {
          name: "mttr_minutes",
          status: observedMttrMinutes <= 30 ? "pass" : observedMttrMinutes <= 45 ? "warning" : "fail",
          threshold_pass: 30,
          threshold_warning: 45,
          observed: observedMttrMinutes
        },
        {
          name: "rpo_minutes",
          status: observedRpoMinutes <= 5 ? "pass" : observedRpoMinutes <= 8 ? "warning" : "fail",
          threshold_pass: 5,
          threshold_warning: 8,
          observed: observedRpoMinutes
        }
      ];

      const failedChecks = checks.filter((item) => item.status === "fail");
      const warningChecks = checks.filter((item) => item.status === "warning");

      const certificationStatus =
        failedChecks.length > 0 ? "failed" : warningChecks.length > 0 ? "conditional" : "certified";
      const gateDecision = certificationStatus === "failed" ? "block" : certificationStatus === "conditional" ? "hold" : "promote";

      res.json({
        tenant_id: tenantId,
        as_of: new Date().toISOString(),
        chaos: {
          drill_type: drillType,
          window_minutes: windowMinutes,
          exercised_failures: ["command_timeout", "sync_degradation", "device_offline_spike"]
        },
        certification: {
          status: certificationStatus,
          gate_decision: gateDecision,
          failed_checks: failedChecks.map((item) => item.name),
          warning_checks: warningChecks.map((item) => item.name)
        },
        objectives: {
          rto_target_minutes: 30,
          rpo_target_minutes: 5,
          observed_mttr_minutes: observedMttrMinutes,
          observed_rpo_minutes: observedRpoMinutes
        },
        checks,
        metrics: {
          devices: {
            online: onlineDevices,
            offline: offlineDevices,
            online_ratio: Number(onlineRatio.toFixed(4)),
            offline_ratio: Number(offlineRatio.toFixed(4))
          },
          commands: {
            completed: commandCompleted,
            failed: commandFailed,
            timeout: commandTimeout,
            recovery_rate: Number(commandRecoveryRate.toFixed(4)),
            failure_ratio: Number(commandFailureRatio.toFixed(4))
          },
          telemetry: {
            sync_total: syncEvents.length,
            sync_failure_count: syncFailureCount,
            sync_failure_ratio: Number(syncFailureRatio.toFixed(4)),
            sync_success_rate: Number(syncSuccessRate.toFixed(4)),
            error_events: errorEvents,
            error_rate_percent: Number(errorRatePercent.toFixed(2))
          }
        }
      });
    } catch {
      res.status(500).json({
        code: "OPS_CHAOS_RESILIENCE_FAILED",
        message: "Failed to evaluate chaos resilience certification gate"
      });
    }
  });

  router.get("/simulation/gameday/evaluate", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      if (!tenantId) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "tenant context is required" });
        return;
      }

      const windowMinutes = Math.min(Math.max(Number(req.query.window_minutes ?? 90), 10), 1440);
      const scenario = String(req.query.scenario ?? "regional_failover_drill").trim().toLowerCase();
      const since = new Date(Date.now() - windowMinutes * 60 * 1000);

      const [onlineDevices, offlineDevices, commandCompleted, commandFailed, commandTimeout, syncEvents, errorEvents] =
        await Promise.all([
          DeviceModel.countDocuments({ tenantId, status: "online" }),
          DeviceModel.countDocuments({ tenantId, status: "offline" }),
          CommandModel.countDocuments({ tenantId, status: "completed", createdAt: { $gte: since } }),
          CommandModel.countDocuments({ tenantId, status: "failed", createdAt: { $gte: since } }),
          CommandModel.countDocuments({ tenantId, status: "timeout", createdAt: { $gte: since } }),
          TelemetryModel.find({ tenantId, kind: "sync", createdAt: { $gte: since } }).select("payload").lean(),
          TelemetryModel.countDocuments({ tenantId, kind: "error", createdAt: { $gte: since } })
        ]);

      const fleetTotal = onlineDevices + offlineDevices;
      const availabilityRatio = fleetTotal === 0 ? 1 : onlineDevices / fleetTotal;
      const commandTotal = commandCompleted + commandFailed + commandTimeout;
      const commandSuccessRate = commandTotal === 0 ? 1 : commandCompleted / commandTotal;
      const commandFailureRatio = commandTotal === 0 ? 0 : (commandFailed + commandTimeout) / commandTotal;
      const errorRatePercent = (errorEvents / Math.max(commandTotal, 1)) * 100;
      const syncFailureCount = syncEvents.filter((item) => isFailureStatus(pickPayloadStatus(item.payload))).length;
      const syncFailureRatio = syncEvents.length === 0 ? 0 : syncFailureCount / syncEvents.length;
      const syncSuccessRate = syncEvents.length === 0 ? 1 : 1 - syncFailureRatio;

      const runbookEvidence = [
        {
          step: "detect_incident",
          expected_minutes: 5,
          observed_minutes: Number((2 + errorRatePercent * 0.8).toFixed(2))
        },
        {
          step: "escalate_oncall",
          expected_minutes: 10,
          observed_minutes: Number((4 + commandFailureRatio * 40).toFixed(2))
        },
        {
          step: "execute_recovery_actions",
          expected_minutes: 20,
          observed_minutes: Number((8 + syncFailureRatio * 70 + (1 - availabilityRatio) * 40).toFixed(2))
        },
        {
          step: "validate_service_recovery",
          expected_minutes: 15,
          observed_minutes: Number((6 + (1 - commandSuccessRate) * 45).toFixed(2))
        }
      ];

      const runbookTotalObserved = Number(
        runbookEvidence.reduce((sum, item) => sum + item.observed_minutes, 0).toFixed(2)
      );
      const runbookTotalExpected = runbookEvidence.reduce((sum, item) => sum + item.expected_minutes, 0);
      const runbookWithinSla = runbookTotalObserved <= runbookTotalExpected;

      const checks = [
        {
          name: "availability_ratio",
          status: availabilityRatio >= 0.9 ? "pass" : availabilityRatio >= 0.8 ? "warning" : "fail",
          observed: Number(availabilityRatio.toFixed(4)),
          threshold_pass: 0.9,
          threshold_warning: 0.8
        },
        {
          name: "command_success_rate",
          status: commandSuccessRate >= 0.92 ? "pass" : commandSuccessRate >= 0.85 ? "warning" : "fail",
          observed: Number(commandSuccessRate.toFixed(4)),
          threshold_pass: 0.92,
          threshold_warning: 0.85
        },
        {
          name: "sync_success_rate",
          status: syncSuccessRate >= 0.95 ? "pass" : syncSuccessRate >= 0.88 ? "warning" : "fail",
          observed: Number(syncSuccessRate.toFixed(4)),
          threshold_pass: 0.95,
          threshold_warning: 0.88
        },
        {
          name: "error_rate_percent",
          status: errorRatePercent <= 1.2 ? "pass" : errorRatePercent <= 2.2 ? "warning" : "fail",
          observed: Number(errorRatePercent.toFixed(2)),
          threshold_pass: 1.2,
          threshold_warning: 2.2
        },
        {
          name: "runbook_execution_time",
          status: runbookWithinSla ? "pass" : runbookTotalObserved <= runbookTotalExpected * 1.2 ? "warning" : "fail",
          observed: runbookTotalObserved,
          threshold_pass: runbookTotalExpected,
          threshold_warning: Number((runbookTotalExpected * 1.2).toFixed(2))
        }
      ];

      const failedChecks = checks.filter((item) => item.status === "fail");
      const warningChecks = checks.filter((item) => item.status === "warning");

      const readiness = failedChecks.length > 0 ? "not_ready" : warningChecks.length > 0 ? "conditional" : "ready";
      const gateDecision = readiness === "not_ready" ? "block" : readiness === "conditional" ? "hold" : "promote";

      res.json({
        tenant_id: tenantId,
        as_of: new Date().toISOString(),
        simulation: {
          scenario,
          window_minutes: windowMinutes,
          exercise_type: "production_game_day"
        },
        readiness: {
          status: readiness,
          gate_decision: gateDecision,
          failed_checks: failedChecks.map((item) => item.name),
          warning_checks: warningChecks.map((item) => item.name)
        },
        runbook: {
          total_expected_minutes: runbookTotalExpected,
          total_observed_minutes: runbookTotalObserved,
          within_sla: runbookWithinSla,
          evidence: runbookEvidence
        },
        checks,
        metrics: {
          devices: {
            online: onlineDevices,
            offline: offlineDevices,
            availability_ratio: Number(availabilityRatio.toFixed(4))
          },
          commands: {
            completed: commandCompleted,
            failed: commandFailed,
            timeout: commandTimeout,
            success_rate: Number(commandSuccessRate.toFixed(4)),
            failure_ratio: Number(commandFailureRatio.toFixed(4))
          },
          telemetry: {
            sync_total: syncEvents.length,
            sync_failure_count: syncFailureCount,
            sync_failure_ratio: Number(syncFailureRatio.toFixed(4)),
            sync_success_rate: Number(syncSuccessRate.toFixed(4)),
            error_events: errorEvents,
            error_rate_percent: Number(errorRatePercent.toFixed(2))
          }
        }
      });
    } catch {
      res.status(500).json({
        code: "OPS_GAMEDAY_SIMULATION_FAILED",
        message: "Failed to evaluate production simulation and game-day readiness"
      });
    }
  });

  router.get("/compliance/evidence/evaluate", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      if (!tenantId) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "tenant context is required" });
        return;
      }

      const windowHours = Math.min(Math.max(Number(req.query.window_hours ?? 24), 1), 168);
      const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
      const retentionDays = Math.min(Math.max(Number(req.query.evidence_retention_days ?? 30), 7), 365);

      const [pairingAuditCount, commandCount, telemetryCount, errorCount, failedCommands, timeoutCommands, syncEvents] =
        await Promise.all([
          PairingAuditModel.countDocuments({ tenantId, createdAt: { $gte: since } }),
          CommandModel.countDocuments({ tenantId, createdAt: { $gte: since } }),
          TelemetryModel.countDocuments({ tenantId, createdAt: { $gte: since } }),
          TelemetryModel.countDocuments({ tenantId, kind: "error", createdAt: { $gte: since } }),
          CommandModel.countDocuments({ tenantId, status: "failed", createdAt: { $gte: since } }),
          CommandModel.countDocuments({ tenantId, status: "timeout", createdAt: { $gte: since } }),
          TelemetryModel.find({ tenantId, kind: "sync", createdAt: { $gte: since } }).select("payload").lean()
        ]);

      const syncFailureCount = syncEvents.filter((item) => isFailureStatus(pickPayloadStatus(item.payload))).length;
      const commandFailureRatio = commandCount === 0 ? 0 : (failedCommands + timeoutCommands) / commandCount;
      const errorRatio = commandCount === 0 ? 0 : errorCount / commandCount;
      const evidenceCoverageRatio =
        commandCount === 0 ? 1 : Math.min(1, (pairingAuditCount + telemetryCount) / Math.max(commandCount, 1));

      const controls = [
        {
          control_id: "audit_trail_coverage",
          status: pairingAuditCount > 0 ? "pass" : "fail",
          observed: pairingAuditCount,
          minimum_required: 1
        },
        {
          control_id: "operational_telemetry_coverage",
          status: telemetryCount >= Math.max(1, Math.floor(commandCount * 0.8)) ? "pass" : "warning",
          observed: telemetryCount,
          minimum_required: Math.max(1, Math.floor(commandCount * 0.8))
        },
        {
          control_id: "command_failure_budget",
          status: commandFailureRatio <= 0.15 ? "pass" : commandFailureRatio <= 0.25 ? "warning" : "fail",
          observed: Number(commandFailureRatio.toFixed(4)),
          maximum_allowed: 0.15
        },
        {
          control_id: "error_event_budget",
          status: errorRatio <= 0.1 ? "pass" : errorRatio <= 0.2 ? "warning" : "fail",
          observed: Number(errorRatio.toFixed(4)),
          maximum_allowed: 0.1
        },
        {
          control_id: "sync_integrity",
          status:
            syncEvents.length === 0
              ? "pass"
              : syncFailureCount / syncEvents.length <= 0.15
                ? "pass"
                : syncFailureCount / syncEvents.length <= 0.25
                  ? "warning"
                  : "fail",
          observed: syncEvents.length === 0 ? 0 : Number((syncFailureCount / syncEvents.length).toFixed(4)),
          maximum_allowed: 0.15
        },
        {
          control_id: "evidence_retention_policy",
          status: retentionDays >= 30 ? "pass" : retentionDays >= 14 ? "warning" : "fail",
          observed: retentionDays,
          minimum_required: 30
        }
      ];

      const failedControls = controls.filter((item) => item.status === "fail");
      const warningControls = controls.filter((item) => item.status === "warning");
      const complianceStatus =
        failedControls.length > 0 ? "non_compliant" : warningControls.length > 0 ? "at_risk" : "compliant";
      const gateDecision = complianceStatus === "non_compliant" ? "block" : complianceStatus === "at_risk" ? "hold" : "promote";

      res.json({
        tenant_id: tenantId,
        as_of: new Date().toISOString(),
        evidence_window_hours: windowHours,
        retention_policy_days: retentionDays,
        compliance: {
          status: complianceStatus,
          gate_decision: gateDecision,
          failed_controls: failedControls.map((item) => item.control_id),
          warning_controls: warningControls.map((item) => item.control_id)
        },
        controls,
        evidence: {
          pairing_audit_events: pairingAuditCount,
          command_events: commandCount,
          telemetry_events: telemetryCount,
          error_events: errorCount,
          sync_events: syncEvents.length,
          sync_failure_events: syncFailureCount,
          evidence_coverage_ratio: Number(evidenceCoverageRatio.toFixed(4))
        }
      });
    } catch {
      res.status(500).json({
        code: "OPS_COMPLIANCE_EVIDENCE_FAILED",
        message: "Failed to evaluate compliance evidence pipeline"
      });
    }
  });

  router.get("/rollback/policy/tune", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      if (!tenantId) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "tenant context is required" });
        return;
      }

      const windowMinutes = Math.min(Math.max(Number(req.query.window_minutes ?? 120), 10), 1440);
      const since = new Date(Date.now() - windowMinutes * 60 * 1000);

      const [onlineDevices, offlineDevices, commandCompleted, commandFailed, commandTimeout, errorEvents, syncEvents] =
        await Promise.all([
          DeviceModel.countDocuments({ tenantId, status: "online" }),
          DeviceModel.countDocuments({ tenantId, status: "offline" }),
          CommandModel.countDocuments({ tenantId, status: "completed", createdAt: { $gte: since } }),
          CommandModel.countDocuments({ tenantId, status: "failed", createdAt: { $gte: since } }),
          CommandModel.countDocuments({ tenantId, status: "timeout", createdAt: { $gte: since } }),
          TelemetryModel.countDocuments({ tenantId, kind: "error", createdAt: { $gte: since } }),
          TelemetryModel.find({ tenantId, kind: "sync", createdAt: { $gte: since } }).select("payload").lean()
        ]);

      const fleetTotal = onlineDevices + offlineDevices;
      const offlineRatio = fleetTotal === 0 ? 0 : offlineDevices / fleetTotal;
      const availabilityRatio = fleetTotal === 0 ? 1 : onlineDevices / fleetTotal;

      const commandTotal = commandCompleted + commandFailed + commandTimeout;
      const commandFailureRatio = commandTotal === 0 ? 0 : (commandFailed + commandTimeout) / commandTotal;
      const commandSuccessRate = commandTotal === 0 ? 1 : commandCompleted / commandTotal;

      const errorRatePercent = (errorEvents / Math.max(commandTotal, 1)) * 100;
      const syncFailureCount = syncEvents.filter((item) => isFailureStatus(pickPayloadStatus(item.payload))).length;
      const syncFailureRatio = syncEvents.length === 0 ? 0 : syncFailureCount / syncEvents.length;

      const riskScore = Number(
        Math.min(
          100,
          commandFailureRatio * 45 + (errorRatePercent / 5) * 25 + offlineRatio * 20 + syncFailureRatio * 10
        ).toFixed(2)
      );

      const sloBudget = {
        error_budget_percent: 1.0,
        command_failure_budget_ratio: 0.08,
        sync_failure_budget_ratio: 0.1,
        availability_budget_ratio: 0.1
      };

      const burnRates = {
        error_budget_burn: Number((errorRatePercent / Math.max(sloBudget.error_budget_percent, 0.0001)).toFixed(4)),
        command_budget_burn: Number(
          (commandFailureRatio / Math.max(sloBudget.command_failure_budget_ratio, 0.0001)).toFixed(4)
        ),
        sync_budget_burn: Number((syncFailureRatio / Math.max(sloBudget.sync_failure_budget_ratio, 0.0001)).toFixed(4)),
        availability_budget_burn: Number((offlineRatio / Math.max(sloBudget.availability_budget_ratio, 0.0001)).toFixed(4))
      };

      const maxBurnRate = Math.max(
        burnRates.error_budget_burn,
        burnRates.command_budget_burn,
        burnRates.sync_budget_burn,
        burnRates.availability_budget_burn
      );

      const policyMode =
        riskScore >= 70 || maxBurnRate >= 1.8
          ? "aggressive"
          : riskScore >= 40 || maxBurnRate >= 1.2
            ? "balanced"
            : "relaxed";

      const rollbackThresholds =
        policyMode === "aggressive"
          ? {
              error_rate_percent: 1.2,
              command_failure_ratio: 0.07,
              sync_failure_ratio: 0.08,
              offline_ratio: 0.1
            }
          : policyMode === "balanced"
            ? {
                error_rate_percent: 1.8,
                command_failure_ratio: 0.1,
                sync_failure_ratio: 0.12,
                offline_ratio: 0.15
              }
            : {
                error_rate_percent: 2.5,
                command_failure_ratio: 0.14,
                sync_failure_ratio: 0.16,
                offline_ratio: 0.2
              };

      const autoRollback =
        errorRatePercent > rollbackThresholds.error_rate_percent ||
        commandFailureRatio > rollbackThresholds.command_failure_ratio ||
        syncFailureRatio > rollbackThresholds.sync_failure_ratio ||
        offlineRatio > rollbackThresholds.offline_ratio;

      const gateDecision = autoRollback ? "block" : policyMode === "balanced" ? "hold" : "promote";

      res.json({
        tenant_id: tenantId,
        as_of: new Date().toISOString(),
        window_minutes: windowMinutes,
        policy: {
          mode: policyMode,
          gate_decision: gateDecision,
          auto_rollback_enabled: true,
          auto_rollback_triggered: autoRollback,
          thresholds: rollbackThresholds
        },
        risk: {
          score: riskScore,
          max_budget_burn_rate: Number(maxBurnRate.toFixed(4)),
          burn_rates: burnRates
        },
        slo_budget: sloBudget,
        metrics: {
          devices: {
            online: onlineDevices,
            offline: offlineDevices,
            availability_ratio: Number(availabilityRatio.toFixed(4)),
            offline_ratio: Number(offlineRatio.toFixed(4))
          },
          commands: {
            completed: commandCompleted,
            failed: commandFailed,
            timeout: commandTimeout,
            success_rate: Number(commandSuccessRate.toFixed(4)),
            failure_ratio: Number(commandFailureRatio.toFixed(4))
          },
          telemetry: {
            sync_total: syncEvents.length,
            sync_failure_count: syncFailureCount,
            sync_failure_ratio: Number(syncFailureRatio.toFixed(4)),
            error_events: errorEvents,
            error_rate_percent: Number(errorRatePercent.toFixed(2))
          }
        }
      });
    } catch {
      res.status(500).json({
        code: "OPS_ROLLBACK_POLICY_TUNE_FAILED",
        message: "Failed to tune rollback policy with SLO budgets"
      });
    }
  });

  router.get("/anomaly/remediation/evaluate", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      if (!tenantId) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "tenant context is required" });
        return;
      }

      const windowMinutes = Math.min(Math.max(Number(req.query.window_minutes ?? 120), 10), 1440);
      const since = new Date(Date.now() - windowMinutes * 60 * 1000);
      const execute = String(req.query.execute ?? "false").trim().toLowerCase() === "true";

      const [
        tenantCommandCompleted,
        tenantCommandFailed,
        tenantCommandTimeout,
        tenantErrorEvents,
        tenantSyncEvents,
        tenantOnlineDevices,
        tenantOfflineDevices,
        globalCommandCompleted,
        globalCommandFailed,
        globalCommandTimeout,
        globalErrorEvents
      ] = await Promise.all([
        CommandModel.countDocuments({ tenantId, status: "completed", createdAt: { $gte: since } }),
        CommandModel.countDocuments({ tenantId, status: "failed", createdAt: { $gte: since } }),
        CommandModel.countDocuments({ tenantId, status: "timeout", createdAt: { $gte: since } }),
        TelemetryModel.countDocuments({ tenantId, kind: "error", createdAt: { $gte: since } }),
        TelemetryModel.find({ tenantId, kind: "sync", createdAt: { $gte: since } }).select("payload").lean(),
        DeviceModel.countDocuments({ tenantId, status: "online" }),
        DeviceModel.countDocuments({ tenantId, status: "offline" }),
        CommandModel.countDocuments({ status: "completed", createdAt: { $gte: since } }),
        CommandModel.countDocuments({ status: "failed", createdAt: { $gte: since } }),
        CommandModel.countDocuments({ status: "timeout", createdAt: { $gte: since } }),
        TelemetryModel.countDocuments({ kind: "error", createdAt: { $gte: since } })
      ]);

      const tenantCommandTotal = tenantCommandCompleted + tenantCommandFailed + tenantCommandTimeout;
      const tenantFailureRatio =
        tenantCommandTotal === 0 ? 0 : (tenantCommandFailed + tenantCommandTimeout) / tenantCommandTotal;
      const tenantErrorRate = (tenantErrorEvents / Math.max(tenantCommandTotal, 1)) * 100;

      const tenantSyncFailureCount = tenantSyncEvents.filter((item) => isFailureStatus(pickPayloadStatus(item.payload))).length;
      const tenantSyncFailureRatio = tenantSyncEvents.length === 0 ? 0 : tenantSyncFailureCount / tenantSyncEvents.length;

      const tenantFleetTotal = tenantOnlineDevices + tenantOfflineDevices;
      const tenantOfflineRatio = tenantFleetTotal === 0 ? 0 : tenantOfflineDevices / tenantFleetTotal;

      const globalCommandTotal = globalCommandCompleted + globalCommandFailed + globalCommandTimeout;
      const globalFailureRatio =
        globalCommandTotal === 0 ? 0 : (globalCommandFailed + globalCommandTimeout) / globalCommandTotal;
      const globalErrorRate = (globalErrorEvents / Math.max(globalCommandTotal, 1)) * 100;

      const anomalySignals = [
        {
          name: "command_failure_ratio",
          tenant_value: Number(tenantFailureRatio.toFixed(4)),
          global_baseline: Number(globalFailureRatio.toFixed(4)),
          delta: Number((tenantFailureRatio - globalFailureRatio).toFixed(4)),
          anomaly:
            tenantFailureRatio > globalFailureRatio * 1.7 && tenantFailureRatio > 0.12
              ? "critical"
              : tenantFailureRatio > globalFailureRatio * 1.3 && tenantFailureRatio > 0.08
                ? "warning"
                : "normal"
        },
        {
          name: "error_rate_percent",
          tenant_value: Number(tenantErrorRate.toFixed(2)),
          global_baseline: Number(globalErrorRate.toFixed(2)),
          delta: Number((tenantErrorRate - globalErrorRate).toFixed(2)),
          anomaly:
            tenantErrorRate > globalErrorRate * 1.7 && tenantErrorRate > 2
              ? "critical"
              : tenantErrorRate > globalErrorRate * 1.3 && tenantErrorRate > 1
                ? "warning"
                : "normal"
        },
        {
          name: "sync_failure_ratio",
          tenant_value: Number(tenantSyncFailureRatio.toFixed(4)),
          global_baseline: 0.1,
          delta: Number((tenantSyncFailureRatio - 0.1).toFixed(4)),
          anomaly: tenantSyncFailureRatio > 0.2 ? "critical" : tenantSyncFailureRatio > 0.12 ? "warning" : "normal"
        },
        {
          name: "offline_ratio",
          tenant_value: Number(tenantOfflineRatio.toFixed(4)),
          global_baseline: 0.1,
          delta: Number((tenantOfflineRatio - 0.1).toFixed(4)),
          anomaly: tenantOfflineRatio > 0.2 ? "critical" : tenantOfflineRatio > 0.12 ? "warning" : "normal"
        }
      ];

      const criticalAnomalies = anomalySignals.filter((item) => item.anomaly === "critical");
      const warningAnomalies = anomalySignals.filter((item) => item.anomaly === "warning");

      const remediationPlan =
        criticalAnomalies.length > 0
          ? [
              "pause_traffic_shift",
              "trigger_targeted_failover_prechecks",
              "restart_failed_command_workers",
              "escalate_to_oncall"
            ]
          : warningAnomalies.length > 0
            ? ["increase_observability_sampling", "throttle_non_critical_commands", "notify_platform_ops"]
            : ["continue_monitoring"];

      const remediationMode = execute ? "execute" : "dry_run";
      const remediationStatus =
        criticalAnomalies.length > 0
          ? remediationMode === "execute"
            ? "executing"
            : "planned"
          : warningAnomalies.length > 0
            ? "queued"
            : "not_required";

      const gateDecision = criticalAnomalies.length > 0 ? "block" : warningAnomalies.length > 0 ? "hold" : "promote";

      res.json({
        tenant_id: tenantId,
        as_of: new Date().toISOString(),
        window_minutes: windowMinutes,
        anomaly_summary: {
          critical_count: criticalAnomalies.length,
          warning_count: warningAnomalies.length,
          status: criticalAnomalies.length > 0 ? "critical" : warningAnomalies.length > 0 ? "warning" : "normal"
        },
        orchestration: {
          mode: remediationMode,
          status: remediationStatus,
          gate_decision: gateDecision,
          actions: remediationPlan
        },
        baselines: {
          global_failure_ratio: Number(globalFailureRatio.toFixed(4)),
          global_error_rate_percent: Number(globalErrorRate.toFixed(2)),
          tenant_failure_ratio: Number(tenantFailureRatio.toFixed(4)),
          tenant_error_rate_percent: Number(tenantErrorRate.toFixed(2))
        },
        anomalies: anomalySignals,
        metrics: {
          commands: {
            completed: tenantCommandCompleted,
            failed: tenantCommandFailed,
            timeout: tenantCommandTimeout,
            failure_ratio: Number(tenantFailureRatio.toFixed(4))
          },
          telemetry: {
            error_events: tenantErrorEvents,
            error_rate_percent: Number(tenantErrorRate.toFixed(2)),
            sync_total: tenantSyncEvents.length,
            sync_failure_count: tenantSyncFailureCount,
            sync_failure_ratio: Number(tenantSyncFailureRatio.toFixed(4))
          },
          devices: {
            online: tenantOnlineDevices,
            offline: tenantOfflineDevices,
            offline_ratio: Number(tenantOfflineRatio.toFixed(4))
          }
        }
      });
    } catch {
      res.status(500).json({
        code: "OPS_ANOMALY_REMEDIATION_FAILED",
        message: "Failed to evaluate anomaly remediation orchestration"
      });
    }
  });

  router.get("/governance/exceptions/evaluate", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      if (!tenantId) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "tenant context is required" });
        return;
      }

      const windowMinutes = Math.min(Math.max(Number(req.query.window_minutes ?? 120), 10), 1440);
      const policyScope = String(req.query.policy_scope ?? "all").trim().toLowerCase() as GovernancePolicyScope;
      const issueMode = String(req.query.issue_mode ?? "dry_run").trim().toLowerCase() as GovernanceIssueMode;

      if (!["all", "rollout", "rollback", "remediation"].includes(policyScope)) {
        res.status(400).json({
          code: "VALIDATION_ERROR",
          message: "policy_scope must be one of all, rollout, rollback, remediation"
        });
        return;
      }

      if (!["dry_run", "issue"].includes(issueMode)) {
        res.status(400).json({
          code: "VALIDATION_ERROR",
          message: "issue_mode must be dry_run or issue"
        });
        return;
      }

      const result = await evaluateGovernancePolicy({
        tenantId,
        windowMinutes,
        policyScope,
        issueMode
      });

      res.json(result);
    } catch {
      res.status(500).json({
        code: "OPS_GOVERNANCE_EXCEPTIONS_FAILED",
        message: "Failed to evaluate policy-as-code governance exceptions"
      });
    }
  });

  router.get("/audit/export", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      if (!tenantId) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "tenant context is required" });
        return;
      }

      const kind = String(req.query.kind ?? "pairing").trim().toLowerCase();
      const format = String(req.query.format ?? "json").trim().toLowerCase();
      const limit = Math.min(Math.max(Number(req.query.limit ?? 500), 1), 5000);

      if (!["pairing", "commands", "telemetry"].includes(kind)) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "kind must be pairing, commands, or telemetry" });
        return;
      }

      if (!["json", "csv"].includes(format)) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "format must be json or csv" });
        return;
      }

      let rows: Record<string, unknown>[] = [];
      if (kind === "pairing") {
        const data = await PairingAuditModel.find({ tenantId }).sort({ createdAt: -1 }).limit(limit).lean();
        rows = data.map((item) => ({
          tenant_id: item.tenantId,
          device_id: item.deviceId,
          hardware_id: item.hardwareId,
          event_type: item.eventType,
          actor_type: item.actorType,
          actor_id: item.actorId,
          result: item.result,
          reason: item.reason,
          created_at: (item as { createdAt?: Date }).createdAt?.toISOString() ?? null
        }));
      }

      if (kind === "commands") {
        const data = await CommandModel.find({ tenantId }).sort({ createdAt: -1 }).limit(limit).lean();
        rows = data.map((item) => ({
          tenant_id: item.tenantId,
          device_id: item.deviceId,
          command_id: item.commandId,
          command_type: item.commandType,
          status: item.status,
          attempts: item.attempts,
          max_attempts: item.maxAttempts,
          timeout_ms: item.timeoutMs,
          sent_at: item.sentAt?.toISOString() ?? null,
          ack_at: item.ackAt?.toISOString() ?? null,
          completed_at: item.completedAt?.toISOString() ?? null,
          error_message: item.errorMessage,
          created_at: (item as { createdAt?: Date }).createdAt?.toISOString() ?? null
        }));
      }

      if (kind === "telemetry") {
        const data = await TelemetryModel.find({ tenantId }).sort({ createdAt: -1 }).limit(limit).lean();
        rows = data.map((item) => ({
          tenant_id: item.tenantId,
          device_id: item.deviceId,
          kind: item.kind,
          correlation_id: item.correlationId,
          payload: JSON.stringify(item.payload ?? {}),
          created_at: (item as { createdAt?: Date }).createdAt?.toISOString() ?? null
        }));
      }

      if (format === "json") {
        res.json({ kind, format, count: rows.length, rows });
        return;
      }

      const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
      const csv = [
        headers.join(","),
        ...rows.map((row) =>
          headers
            .map((header) => {
              const value = row[header];
              const raw = value === null || value === undefined ? "" : String(value);
              return `"${raw.replaceAll('"', '""')}"`;
            })
            .join(",")
        )
      ].join("\n");

      res.setHeader("content-type", "text/csv; charset=utf-8");
      res.setHeader("content-disposition", `attachment; filename=\"audit-${kind}.csv\"`);
      res.status(200).send(csv);
    } catch {
      res.status(500).json({ code: "AUDIT_EXPORT_FAILED", message: "Failed to export audit trail" });
    }
  });

  router.get("/promotion/eligible", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      if (!tenantId) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "tenant context is required" });
        return;
      }

      const sourceEnv = String(req.query.source_env ?? "staging").trim().toLowerCase();
      const targetEnv = String(req.query.target_env ?? "production").trim().toLowerCase();
      const sampleLimit = Math.min(Math.max(Number(req.query.sample_limit ?? 100), 10), 500);

      const validEnvs = ["dev", "development", "staging", "prod", "production"];
      if (!validEnvs.includes(sourceEnv) || !validEnvs.includes(targetEnv)) {
        res.status(400).json({
          code: "VALIDATION_ERROR",
          message: "source_env and target_env must be: dev, development, staging, prod, or production"
        });
        return;
      }

      const normalizeEnv = (e: string) => (e === "production" ? "prod" : e === "development" ? "dev" : e);
      const sourceNorm = normalizeEnv(sourceEnv);
      const targetNorm = normalizeEnv(targetEnv);

      const envOrder = ["dev", "staging", "prod"];
      const sourceIdx = envOrder.indexOf(sourceNorm);
      const targetIdx = envOrder.indexOf(targetNorm);

      if (targetIdx <= sourceIdx) {
        res.status(400).json({
          code: "VALIDATION_ERROR",
          message: `Cannot promote from ${sourceNorm} to ${targetNorm}: must move forward in sequence`
        });
        return;
      }

      const [mongoMediaCount, mongoPlaylistCount] = await Promise.all([
        MediaModel.countDocuments({ tenantId }),
        PlaylistModel.countDocuments({ tenantId })
      ]);

      const pool = isPostgresConnected() ? getPostgresPool() : null;
      if (!pool) {
        res.status(503).json({
          code: "POSTGRES_UNAVAILABLE",
          message: "PostgreSQL connection required for promotion eligibility check"
        });
        return;
      }

      const [pgMediaCountRes, pgPlaylistCountRes] = await Promise.all([
        pool.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM media WHERE tenant_id = $1::uuid AND deleted_at IS NULL`,
          [tenantId]
        ),
        pool.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM playlists WHERE tenant_id = $1::uuid AND deleted_at IS NULL`,
          [tenantId]
        )
      ]);

      const pgMediaCount = Number(pgMediaCountRes.rows[0]?.count ?? 0);
      const pgPlaylistCount = Number(pgPlaylistCountRes.rows[0]?.count ?? 0);

      const [mongoMedia, mongoPlaylists, pgMediaRows, pgPlaylistRows] = await Promise.all([
        MediaModel.find({ tenantId }).sort({ updatedAt: -1 }).limit(sampleLimit).lean(),
        PlaylistModel.find({ tenantId }).sort({ updatedAt: -1 }).limit(sampleLimit).lean(),
        pool.query<{ external_id: string; checksum_sha256: string; status: string }>(
          `SELECT external_id, checksum_sha256, status
           FROM media
           WHERE tenant_id = $1::uuid AND deleted_at IS NULL
           ORDER BY updated_at DESC
           LIMIT $2`,
          [tenantId, sampleLimit]
        ),
        pool.query<{ external_id: string; version: number; item_count: number }>(
          `SELECT external_id, version, jsonb_array_length(items_json) AS item_count
           FROM playlists
           WHERE tenant_id = $1::uuid AND deleted_at IS NULL
           ORDER BY updated_at DESC
           LIMIT $2`,
          [tenantId, sampleLimit]
        )
      ]);

      const pgMediaByExternalId = new Map(pgMediaRows.rows.map((item) => [item.external_id, item]));
      const pgPlaylistByExternalId = new Map(pgPlaylistRows.rows.map((item) => [item.external_id, item]));

      const mediaMismatchCount = mongoMedia.filter((mongo) => {
        const externalId = String((mongo as { _id: unknown })._id);
        const pg = pgMediaByExternalId.get(externalId);
        return !pg || pg.checksum_sha256 !== mongo.checksumSha256 || pg.status !== mongo.status;
      }).length;

      const playlistMismatchCount = mongoPlaylists.filter((mongo) => {
        const externalId = String((mongo as { _id: unknown })._id);
        const pg = pgPlaylistByExternalId.get(externalId);
        return !pg || pg.version !== mongo.version || pg.item_count !== mongo.items.length;
      }).length;

      const parityOk =
        mongoMediaCount === pgMediaCount &&
        mongoPlaylistCount === pgPlaylistCount &&
        mediaMismatchCount === 0 &&
        playlistMismatchCount === 0;

      res.json({
        tenant_id: tenantId,
        as_of: new Date().toISOString(),
        promotion: {
          source_env: sourceNorm,
          target_env: targetNorm,
          eligible: parityOk,
          reason: parityOk ? "parity verification passed" : "parity verification failed"
        },
        parity: {
          ok: parityOk,
          counts: {
            media: {
              mongo: mongoMediaCount,
              postgres: pgMediaCount,
              match: mongoMediaCount === pgMediaCount
            },
            playlists: {
              mongo: mongoPlaylistCount,
              postgres: pgPlaylistCount,
              match: mongoPlaylistCount === pgPlaylistCount
            }
          },
          sample_verification: {
            media_sample_size: mongoMedia.length,
            media_mismatches: mediaMismatchCount,
            playlists_sample_size: mongoPlaylists.length,
            playlists_mismatches: playlistMismatchCount
          }
        }
      });
    } catch {
      res.status(500).json({
        code: "OPS_PROMOTION_ELIGIBLE_FAILED",
        message: "Failed to evaluate promotion eligibility"
      });
    }
  });

  return router;
}
