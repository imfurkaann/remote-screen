import { getEnv } from "../config/env.js";
import { connectMongo, disconnectMongo } from "../lib/mongo.js";
import { CommandModel } from "../models/command.model.js";
import { DeviceModel } from "../models/device.model.js";
import { TelemetryModel } from "../models/telemetry.model.js";

function requireTenantId(): string {
  const tenantId = process.env.CHECK_TENANT_ID;
  if (!tenantId) {
    throw new Error("CHECK_TENANT_ID env var is required");
  }
  return tenantId;
}

function getCurrentPercentage(): number {
  const raw = Number(process.env.PILOT_CURRENT_PERCENTAGE ?? 10);
  return Math.min(Math.max(Number.isFinite(raw) ? raw : 10, 1), 100);
}

function getWindowMinutes(): number {
  const raw = Number(process.env.PILOT_WINDOW_MINUTES ?? 60);
  return Math.min(Math.max(Number.isFinite(raw) ? raw : 60, 5), 1440);
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
  const currentPercentage = getCurrentPercentage();
  const windowMinutes = getWindowMinutes();

  await connectMongo(env.mongoUri);

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

  const report = {
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
  };

  console.log(JSON.stringify(report, null, 2));

  if (decision === "rollback") {
    process.exitCode = 2;
  } else if (decision === "hold") {
    process.exitCode = 1;
  }

  await disconnectMongo();
}

run().catch(async (error) => {
  console.error("[check-pilot-rollout] failed", error);
  try {
    await disconnectMongo();
  } catch {
    // ignore
  }
  process.exitCode = 1;
});
