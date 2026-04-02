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
  const raw = Number(process.env.ANOMALY_WINDOW_MINUTES ?? 120);
  return Math.min(Math.max(Number.isFinite(raw) ? raw : 120, 10), 1440);
}

function getExecuteMode(): boolean {
  return String(process.env.ANOMALY_EXECUTE ?? "false").trim().toLowerCase() === "true";
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
  const execute = getExecuteMode();

  await connectMongo(env.mongoUri);

  const since = new Date(Date.now() - windowMinutes * 60 * 1000);

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
  const tenantFailureRatio = tenantCommandTotal === 0 ? 0 : (tenantCommandFailed + tenantCommandTimeout) / tenantCommandTotal;
  const tenantErrorRate = (tenantErrorEvents / Math.max(tenantCommandTotal, 1)) * 100;

  const tenantSyncFailureCount = tenantSyncEvents.filter((item) => isFailureStatus(pickPayloadStatus(item.payload))).length;
  const tenantSyncFailureRatio = tenantSyncEvents.length === 0 ? 0 : tenantSyncFailureCount / tenantSyncEvents.length;

  const tenantFleetTotal = tenantOnlineDevices + tenantOfflineDevices;
  const tenantOfflineRatio = tenantFleetTotal === 0 ? 0 : tenantOfflineDevices / tenantFleetTotal;

  const globalCommandTotal = globalCommandCompleted + globalCommandFailed + globalCommandTimeout;
  const globalFailureRatio = globalCommandTotal === 0 ? 0 : (globalCommandFailed + globalCommandTimeout) / globalCommandTotal;
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
      ? ["pause_traffic_shift", "trigger_targeted_failover_prechecks", "restart_failed_command_workers", "escalate_to_oncall"]
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

  const report = {
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
  console.error("[check-anomaly-remediation] failed", error);
  try {
    await disconnectMongo();
  } catch {
    // ignore
  }
  process.exitCode = 1;
});
