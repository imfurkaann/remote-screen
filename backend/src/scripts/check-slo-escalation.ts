import { getEnv } from "../config/env.js";
import { connectMongo, disconnectMongo } from "../lib/mongo.js";
import { connectPostgres, disconnectPostgres, getPostgresPool } from "../lib/postgres.js";
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

function getSloWindowMinutes(): number {
  const raw = Number(process.env.SLO_WINDOW_MINUTES ?? 240);
  return Math.min(Math.max(Number.isFinite(raw) ? raw : 240, 30), 1440);
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
  const sloWindowMinutes = getSloWindowMinutes();

  if (!env.pgEnabled) {
    throw new Error("PG_ENABLED=true is required");
  }

  await connectMongo(env.mongoUri);
  await connectPostgres(env);

  const now = Date.now();
  const sloWindowMs = sloWindowMinutes * 60 * 1000;
  const sloSince = new Date(now - sloWindowMs);

  const [
    commandCompleted,
    commandFailed,
    commandTimeout,
    syncEvents,
    errorEvents
  ] = await Promise.all([
    CommandModel.countDocuments({ tenantId, status: "completed", createdAt: { $gte: sloSince } }),
    CommandModel.countDocuments({ tenantId, status: "failed", createdAt: { $gte: sloSince } }),
    CommandModel.countDocuments({ tenantId, status: "timeout", createdAt: { $gte: sloSince } }),
    TelemetryModel.find({ tenantId, kind: "sync", createdAt: { $gte: sloSince } }).select("payload").lean(),
    TelemetryModel.countDocuments({ tenantId, kind: "error", createdAt: { $gte: sloSince } })
  ]);

  const commandTotal = commandCompleted + commandFailed + commandTimeout;
  const commandSuccessRate = commandTotal === 0 ? 1.0 : commandCompleted / commandTotal;
  const errorRate = (errorEvents / Math.max(commandTotal, 1)) * 100;
  const syncFailures = syncEvents.filter((item) => isFailureStatus(pickPayloadStatus(item.payload))).length;
  const syncSuccessRate = syncEvents.length === 0 ? 1.0 : 1 - syncFailures / syncEvents.length;

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
      status: syncSuccessRate >= 0.98 ? "healthy" : syncSuccessRate >= 0.9 ? "warning" : "critical"
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

  const report = {
    tenant_id: tenantId,
    as_of: new Date().toISOString(),
    inputs: {
      slo_window_minutes: sloWindowMinutes
    },
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
      total: commandTotal,
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
    }
  };

  console.log(JSON.stringify(report, null, 2));

  if (escalation === "critical") {
    process.exitCode = 2;
  } else if (escalation === "warning") {
    process.exitCode = 1;
  }

  await disconnectMongo();
  await disconnectPostgres();
}

run().catch(async (error) => {
  console.error("[check-slo-escalation] failed", error);
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
