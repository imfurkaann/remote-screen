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
  const raw = Number(process.env.ROLLBACK_WINDOW_MINUTES ?? 120);
  return Math.min(Math.max(Number.isFinite(raw) ? raw : 120, 10), 1440);
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

  await connectMongo(env.mongoUri);

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
    Math.min(100, commandFailureRatio * 45 + (errorRatePercent / 5) * 25 + offlineRatio * 20 + syncFailureRatio * 10).toFixed(2)
  );

  const sloBudget = {
    error_budget_percent: 1.0,
    command_failure_budget_ratio: 0.08,
    sync_failure_budget_ratio: 0.1,
    availability_budget_ratio: 0.1
  };

  const burnRates = {
    error_budget_burn: Number((errorRatePercent / Math.max(sloBudget.error_budget_percent, 0.0001)).toFixed(4)),
    command_budget_burn: Number((commandFailureRatio / Math.max(sloBudget.command_failure_budget_ratio, 0.0001)).toFixed(4)),
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
    riskScore >= 70 || maxBurnRate >= 1.8 ? "aggressive" : riskScore >= 40 || maxBurnRate >= 1.2 ? "balanced" : "relaxed";

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

  const report = {
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
  };

  console.log(JSON.stringify(report, null, 2));

  if (gateDecision === "block") {
    process.exitCode = 2;
  } else if (gateDecision === "hold") {
    process.exitCode = 1;
  }

  await disconnectMongo();
}

run().catch(async (error) => {
  console.error("[check-rollback-policy] failed", error);
  try {
    await disconnectMongo();
  } catch {
    // ignore
  }
  process.exitCode = 1;
});
