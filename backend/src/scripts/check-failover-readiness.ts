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

function getWindowMinutes(): number {
  const raw = Number(process.env.FAILOVER_WINDOW_MINUTES ?? 60);
  return Math.min(Math.max(Number.isFinite(raw) ? raw : 60, 5), 1440);
}

function getPrimaryRegion(): string {
  return String(process.env.PRIMARY_REGION ?? "eu-central-1").trim();
}

function getSecondaryRegion(): string {
  return String(process.env.SECONDARY_REGION ?? "eu-west-1").trim();
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
  const primaryRegion = getPrimaryRegion();
  const secondaryRegion = getSecondaryRegion();

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

  const report = {
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
  };

  console.log(JSON.stringify(report, null, 2));

  if (decision === "failover_now") {
    process.exitCode = 2;
  } else if (decision === "prepare_failover") {
    process.exitCode = 1;
  }

  await disconnectMongo();
}

run().catch(async (error) => {
  console.error("[check-failover-readiness] failed", error);
  try {
    await disconnectMongo();
  } catch {
    // ignore
  }
  process.exitCode = 1;
});
