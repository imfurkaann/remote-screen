import { getEnv } from "../config/env.js";
import { connectMongo, disconnectMongo } from "../lib/mongo.js";
import { connectPostgres, disconnectPostgres, getPostgresPool } from "../lib/postgres.js";
import { CommandModel } from "../models/command.model.js";
import { DeviceModel } from "../models/device.model.js";
import { MediaModel } from "../models/media.model.js";
import { PlaylistModel } from "../models/playlist.model.js";
import { TelemetryModel } from "../models/telemetry.model.js";

function requireTenantId(): string {
  const tenantId = process.env.CHECK_TENANT_ID;
  if (!tenantId) {
    throw new Error("CHECK_TENANT_ID env var is required");
  }
  return tenantId;
}

function getWindowMinutes(): number {
  const raw = Number(process.env.CHECK_WINDOW_MINUTES ?? 15);
  return Math.min(Math.max(Number.isFinite(raw) ? raw : 15, 5), 180);
}

function getSampleLimit(): number {
  const raw = Number(process.env.CHECK_SAMPLE_LIMIT ?? 20);
  return Math.min(Math.max(Number.isFinite(raw) ? raw : 20, 1), 100);
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

async function run(): Promise<void> {
  const env = getEnv();
  const tenantId = requireTenantId();
  const windowMinutes = getWindowMinutes();
  const sampleLimit = getSampleLimit();

  if (!env.pgEnabled) {
    throw new Error("PG_ENABLED=true is required");
  }

  await connectMongo(env.mongoUri);
  await connectPostgres(env);

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
      severity: offlineRatio >= 0.2 ? "critical" : offlineRatio >= 0.1 ? "warning" : "ok"
    },
    {
      rule: "command_failure",
      severity: commandFailureRatio >= 0.15 ? "critical" : commandFailureRatio >= 0.08 ? "warning" : "ok"
    },
    {
      rule: "sync_failure_spike",
      severity: syncFailureRatio >= 0.2 ? "critical" : syncFailureRatio >= 0.1 ? "warning" : "ok"
    },
    {
      rule: "error_telemetry_burst",
      severity: errorEvents >= 25 ? "critical" : errorEvents >= 10 ? "warning" : "ok"
    },
    {
      rule: "heartbeat_drop",
      severity: heartbeatDropRatio >= 0.7 ? "critical" : heartbeatDropRatio >= 0.5 ? "warning" : "ok"
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

  const criticalAlerts = alerts.filter((item) => item.severity === "critical");
  const warningAlerts = alerts.filter((item) => item.severity === "warning");

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

  const report = {
    tenant_id: tenantId,
    as_of: new Date().toISOString(),
    inputs: {
      window_minutes: windowMinutes,
      sample_limit: sampleLimit
    },
    decision,
    reasons,
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
  };

  console.log(JSON.stringify(report, null, 2));

  if (decision === "block") {
    process.exitCode = 2;
  }

  await disconnectMongo();
  await disconnectPostgres();
}

run().catch(async (error) => {
  console.error("[check-rollout-guardrails] failed", error);
  try {
    await disconnectMongo();
  } catch {
    // ignore
  }
  try {
    await disconnectPostgres();
  } catch {
    // ignore
  }
  process.exitCode = 1;
});
