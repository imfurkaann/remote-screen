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

function getCurrentTrafficPercent(): number {
  const raw = Number(process.env.CANARY_CURRENT_TRAFFIC_PERCENT ?? 10);
  return Math.min(Math.max(Number.isFinite(raw) ? raw : 10, 1), 100);
}

function getStepPercent(): number {
  const raw = Number(process.env.CANARY_STEP_PERCENT ?? 10);
  return Math.min(Math.max(Number.isFinite(raw) ? raw : 10, 1), 50);
}

function getWindowMinutes(): number {
  const raw = Number(process.env.CANARY_WINDOW_MINUTES ?? 30);
  return Math.min(Math.max(Number.isFinite(raw) ? raw : 30, 5), 1440);
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
  const currentTrafficPercent = getCurrentTrafficPercent();
  const stepPercent = getStepPercent();
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

  const rollbackTriggered =
    errorRatePercent > 2 || commandFailureRatio > 0.12 || offlineRatio > 0.2 || syncFailureRatio > 0.15;
  const holdTriggered = errorRatePercent > 1 || commandFailureRatio > 0.06 || offlineRatio > 0.1 || syncFailureRatio > 0.08;

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

  const report = {
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
  console.error("[check-canary-deployment] failed", error);
  try {
    await disconnectMongo();
  } catch {
    // ignore
  }
  process.exitCode = 1;
});
