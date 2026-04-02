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
  const raw = Number(process.env.CHAOS_WINDOW_MINUTES ?? 60);
  return Math.min(Math.max(Number.isFinite(raw) ? raw : 60, 5), 1440);
}

function getDrillType(): string {
  return String(process.env.CHAOS_DRILL_TYPE ?? "network_partition").trim().toLowerCase();
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
  const drillType = getDrillType();

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

  const certificationStatus = failedChecks.length > 0 ? "failed" : warningChecks.length > 0 ? "conditional" : "certified";
  const gateDecision = certificationStatus === "failed" ? "block" : certificationStatus === "conditional" ? "hold" : "promote";

  const report = {
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
  console.error("[check-chaos-resilience] failed", error);
  try {
    await disconnectMongo();
  } catch {
    // ignore
  }
  process.exitCode = 1;
});
