import { getEnv } from "../config/env.js";
import { connectMongo, disconnectMongo } from "../lib/mongo.js";
import { CommandModel } from "../models/command.model.js";
import { PairingAuditModel } from "../models/pairing-audit.model.js";
import { TelemetryModel } from "../models/telemetry.model.js";

function requireTenantId(): string {
  const tenantId = process.env.CHECK_TENANT_ID;
  if (!tenantId) {
    throw new Error("CHECK_TENANT_ID env var is required");
  }
  return tenantId;
}

function getWindowHours(): number {
  const raw = Number(process.env.COMPLIANCE_WINDOW_HOURS ?? 24);
  return Math.min(Math.max(Number.isFinite(raw) ? raw : 24, 1), 168);
}

function getRetentionDays(): number {
  const raw = Number(process.env.EVIDENCE_RETENTION_DAYS ?? 30);
  return Math.min(Math.max(Number.isFinite(raw) ? raw : 30, 7), 365);
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
  const windowHours = getWindowHours();
  const retentionDays = getRetentionDays();

  await connectMongo(env.mongoUri);

  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  const [pairingAuditCount, commandCount, telemetryCount, errorCount, failedCommands, timeoutCommands, syncEvents] =
    await Promise.all([
      PairingAuditModel.countDocuments({ tenantId, createdAt: { $gte: since } }),
      CommandModel.countDocuments({ tenantId, createdAt: { $gte: since } }),
      TelemetryModel.countDocuments({ tenantId, createdAt: { $gte: since } }),
      TelemetryModel.countDocuments({ tenantId, kind: "error", createdAt: { $gte: since } }),
      CommandModel.countDocuments({ tenantId, status: "failed", createdAt: { $gte: since } }),
      CommandModel.countDocuments({ tenantId, status: "timeout", createdAt: { $gte: since } }),
      TelemetryModel.find({ tenantId, kind: "sync", createdAt: { $gte: since } }).select("payload").lean()
    ]);

  const syncFailureCount = syncEvents.filter((item) => isFailureStatus(pickPayloadStatus(item.payload))).length;
  const commandFailureRatio = commandCount === 0 ? 0 : (failedCommands + timeoutCommands) / commandCount;
  const errorRatio = commandCount === 0 ? 0 : errorCount / commandCount;
  const evidenceCoverageRatio =
    commandCount === 0 ? 1 : Math.min(1, (pairingAuditCount + telemetryCount) / Math.max(commandCount, 1));

  const controls = [
    {
      control_id: "audit_trail_coverage",
      status: pairingAuditCount > 0 ? "pass" : "fail",
      observed: pairingAuditCount,
      minimum_required: 1
    },
    {
      control_id: "operational_telemetry_coverage",
      status: telemetryCount >= Math.max(1, Math.floor(commandCount * 0.8)) ? "pass" : "warning",
      observed: telemetryCount,
      minimum_required: Math.max(1, Math.floor(commandCount * 0.8))
    },
    {
      control_id: "command_failure_budget",
      status: commandFailureRatio <= 0.15 ? "pass" : commandFailureRatio <= 0.25 ? "warning" : "fail",
      observed: Number(commandFailureRatio.toFixed(4)),
      maximum_allowed: 0.15
    },
    {
      control_id: "error_event_budget",
      status: errorRatio <= 0.1 ? "pass" : errorRatio <= 0.2 ? "warning" : "fail",
      observed: Number(errorRatio.toFixed(4)),
      maximum_allowed: 0.1
    },
    {
      control_id: "sync_integrity",
      status:
        syncEvents.length === 0
          ? "pass"
          : syncFailureCount / syncEvents.length <= 0.15
            ? "pass"
            : syncFailureCount / syncEvents.length <= 0.25
              ? "warning"
              : "fail",
      observed: syncEvents.length === 0 ? 0 : Number((syncFailureCount / syncEvents.length).toFixed(4)),
      maximum_allowed: 0.15
    },
    {
      control_id: "evidence_retention_policy",
      status: retentionDays >= 30 ? "pass" : retentionDays >= 14 ? "warning" : "fail",
      observed: retentionDays,
      minimum_required: 30
    }
  ];

  const failedControls = controls.filter((item) => item.status === "fail");
  const warningControls = controls.filter((item) => item.status === "warning");
  const complianceStatus = failedControls.length > 0 ? "non_compliant" : warningControls.length > 0 ? "at_risk" : "compliant";
  const gateDecision = complianceStatus === "non_compliant" ? "block" : complianceStatus === "at_risk" ? "hold" : "promote";

  const report = {
    tenant_id: tenantId,
    as_of: new Date().toISOString(),
    evidence_window_hours: windowHours,
    retention_policy_days: retentionDays,
    compliance: {
      status: complianceStatus,
      gate_decision: gateDecision,
      failed_controls: failedControls.map((item) => item.control_id),
      warning_controls: warningControls.map((item) => item.control_id)
    },
    controls,
    evidence: {
      pairing_audit_events: pairingAuditCount,
      command_events: commandCount,
      telemetry_events: telemetryCount,
      error_events: errorCount,
      sync_events: syncEvents.length,
      sync_failure_events: syncFailureCount,
      evidence_coverage_ratio: Number(evidenceCoverageRatio.toFixed(4))
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
  console.error("[check-compliance-evidence] failed", error);
  try {
    await disconnectMongo();
  } catch {
    // ignore
  }
  process.exitCode = 1;
});
