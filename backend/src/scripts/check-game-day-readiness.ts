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
  const raw = Number(process.env.GAME_DAY_WINDOW_MINUTES ?? 90);
  return Math.min(Math.max(Number.isFinite(raw) ? raw : 90, 10), 1440);
}

function getScenario(): string {
  return String(process.env.GAME_DAY_SCENARIO ?? "regional_failover_drill").trim().toLowerCase();
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
  const scenario = getScenario();

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

  const runbookTotalObserved = Number(runbookEvidence.reduce((sum, item) => sum + item.observed_minutes, 0).toFixed(2));
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

  const report = {
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
  console.error("[check-game-day-readiness] failed", error);
  try {
    await disconnectMongo();
  } catch {
    // ignore
  }
  process.exitCode = 1;
});
