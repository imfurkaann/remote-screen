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
  const raw = Number(process.env.INCIDENT_WINDOW_MINUTES ?? 30);
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
  const incidentWindowMinutes = getWindowMinutes();

  await connectMongo(env.mongoUri);

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
        ? ["hold_deployment", "scale_read_replicas", "run_targeted_health_checks", "open_incident_timeline"]
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

  const report = {
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

  if (incidentSeverity === "sev0") {
    process.exitCode = 2;
  } else if (incidentSeverity === "sev1" || incidentSeverity === "sev2") {
    process.exitCode = 1;
  }

  await disconnectMongo();
}

run().catch(async (error) => {
  console.error("[check-incident-recovery] failed", error);
  try {
    await disconnectMongo();
  } catch {
    // ignore
  }
  process.exitCode = 1;
});
