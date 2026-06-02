import { CommandModel } from "../models/command.model.js";
import { DeviceModel } from "../models/device.model.js";
import { TelemetryModel } from "../models/telemetry.model.js";

export type GovernancePolicyScope = "all" | "rollout" | "rollback" | "remediation";
export type GovernanceIssueMode = "dry_run" | "issue";

export type GovernanceException = {
  id: string;
  policy: "rollout_guardrail" | "rollback_policy" | "anomaly_remediation";
  severity: "warning" | "critical";
  reason: string;
  required_approvals: string[];
  expires_at: string;
  trace: Record<string, unknown>;
};

export type GovernanceEvaluation = {
  tenant_id: string;
  as_of: string;
  window_minutes: number;
  policy_scope: GovernancePolicyScope;
  issue_mode: GovernanceIssueMode;
  decision: "promote" | "hold" | "block";
  workflow: {
    status: "cleared" | "pending_approval" | "requires_exception";
    traceable_exceptions: number;
    required_approvals: string[];
  };
  policies: Array<{
    name: string;
    severity: "warning" | "critical" | "ok";
    status: "healthy" | "warning" | "critical";
    reason: string;
    thresholds: Record<string, number>;
    metrics: Record<string, number>;
  }>;
  exceptions: GovernanceException[];
  metrics: {
    devices: {
      online: number;
      offline: number;
      offline_ratio: number;
    };
    commands: {
      completed: number;
      failed: number;
      timeout: number;
      failure_ratio: number;
      success_rate: number;
    };
    telemetry: {
      error_events: number;
      error_rate_percent: number;
      sync_total: number;
      sync_failure_count: number;
      sync_failure_ratio: number;
    };
    risk: {
      score: number;
      max_budget_burn_rate: number;
    };
  };
};

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

function buildRequiredApprovals(severity: "warning" | "critical"): string[] {
  return severity === "critical"
    ? ["tenant_owner", "security", "backend_lead"]
    : ["tenant_admin", "backend_lead"];
}

function buildException(
  policy: GovernanceException["policy"],
  severity: "warning" | "critical",
  reason: string,
  trace: Record<string, unknown>
): GovernanceException {
  const expiresInHours = severity === "critical" ? 4 : 24;
  return {
    id: `${policy}-${severity}-${Date.now()}`,
    policy,
    severity,
    reason,
    required_approvals: buildRequiredApprovals(severity),
    expires_at: new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString(),
    trace
  };
}

export async function evaluateGovernancePolicy(options: {
  tenantId: string;
  windowMinutes: number;
  policyScope: GovernancePolicyScope;
  issueMode: GovernanceIssueMode;
}): Promise<GovernanceEvaluation> {
  const { tenantId, windowMinutes, policyScope, issueMode } = options;
  const since = new Date(Date.now() - windowMinutes * 60 * 1000);

  const [
    onlineDevices,
    offlineDevices,
    commandCompleted,
    commandFailed,
    commandTimeout,
    errorEvents,
    syncEvents,
    globalCommandCompleted,
    globalCommandFailed,
    globalCommandTimeout,
    globalErrorEvents,
    globalOnlineDevices,
    globalOfflineDevices
  ] = await Promise.all([
    DeviceModel.countDocuments({ tenantId, status: "online" }),
    DeviceModel.countDocuments({ tenantId, status: "offline" }),
    CommandModel.countDocuments({ tenantId, status: "completed", createdAt: { $gte: since } }),
    CommandModel.countDocuments({ tenantId, status: "failed", createdAt: { $gte: since } }),
    CommandModel.countDocuments({ tenantId, status: "timeout", createdAt: { $gte: since } }),
    TelemetryModel.countDocuments({ tenantId, kind: "error", createdAt: { $gte: since } }),
    TelemetryModel.find({ tenantId, kind: "sync", createdAt: { $gte: since } }).select("payload").lean(),
    CommandModel.countDocuments({ status: "completed", createdAt: { $gte: since } }),
    CommandModel.countDocuments({ status: "failed", createdAt: { $gte: since } }),
    CommandModel.countDocuments({ status: "timeout", createdAt: { $gte: since } }),
    TelemetryModel.countDocuments({ kind: "error", createdAt: { $gte: since } }),
    DeviceModel.countDocuments({ status: "online" }),
    DeviceModel.countDocuments({ status: "offline" })
  ]);

  const tenantFleetTotal = onlineDevices + offlineDevices;
  const offlineRatio = tenantFleetTotal === 0 ? 0 : offlineDevices / tenantFleetTotal;

  const commandTotal = commandCompleted + commandFailed + commandTimeout;
  const commandFailureRatio = commandTotal === 0 ? 0 : (commandFailed + commandTimeout) / commandTotal;
  const commandSuccessRate = commandTotal === 0 ? 1 : commandCompleted / commandTotal;
  const errorRatePercent = (errorEvents / Math.max(commandTotal, 1)) * 100;
  const syncFailureCount = syncEvents.filter((item) => isFailureStatus(pickPayloadStatus(item.payload))).length;
  const syncFailureRatio = syncEvents.length === 0 ? 0 : syncFailureCount / syncEvents.length;

  const globalCommandTotal = globalCommandCompleted + globalCommandFailed + globalCommandTimeout;
  const globalFailureRatio = globalCommandTotal === 0 ? 0 : (globalCommandFailed + globalCommandTimeout) / globalCommandTotal;
  const globalErrorRatePercent = (globalErrorEvents / Math.max(globalCommandTotal, 1)) * 100;
  const globalFleetTotal = globalOnlineDevices + globalOfflineDevices;
  const globalOfflineRatio = globalFleetTotal === 0 ? 0 : globalOfflineDevices / globalFleetTotal;

  const riskScore = Number(
    Math.min(100, commandFailureRatio * 45 + (errorRatePercent / 5) * 25 + offlineRatio * 20 + syncFailureRatio * 10).toFixed(2)
  );

  const maxBudgetBurnRate = Math.max(
    errorRatePercent / 1.0,
    commandFailureRatio / 0.08,
    syncFailureRatio / 0.1,
    offlineRatio / 0.1
  );

  const rolloutSeverity =
    errorRatePercent >= 2.5 || commandFailureRatio >= 0.15 || syncFailureRatio >= 0.2 || offlineRatio >= 0.2
      ? "critical"
      : errorRatePercent >= 1 || commandFailureRatio >= 0.08 || syncFailureRatio >= 0.1 || offlineRatio >= 0.1
        ? "warning"
        : "ok";

  const rollbackSeverity =
    riskScore >= 70 || maxBudgetBurnRate >= 1.8
      ? "critical"
      : riskScore >= 40 || maxBudgetBurnRate >= 1.2
        ? "warning"
        : "ok";

  const anomalySeverity =
    commandFailureRatio > globalFailureRatio * 1.7 && commandFailureRatio > 0.12
      ? "critical"
      : errorRatePercent > globalErrorRatePercent * 1.3 && errorRatePercent > 1
        ? "warning"
        : syncFailureRatio > 0.12 || offlineRatio > Math.max(globalOfflineRatio * 1.3, 0.12)
          ? "warning"
          : "ok";

  const policyEvaluations: GovernanceEvaluation["policies"] = [
    {
      name: "rollout_guardrail",
      severity: rolloutSeverity,
      status: rolloutSeverity === "ok" ? "healthy" : (rolloutSeverity as "warning" | "critical"),
      reason:
        rolloutSeverity === "critical"
          ? "current telemetry exceeds rollout guardrails"
          : rolloutSeverity === "warning"
            ? "guardrails need an approved exception"
            : "guardrails are healthy",
      thresholds: {
        error_rate_percent: 2.5,
        command_failure_ratio: 0.15,
        sync_failure_ratio: 0.2,
        offline_ratio: 0.2
      },
      metrics: {
        error_rate_percent: Number(errorRatePercent.toFixed(2)),
        command_failure_ratio: Number(commandFailureRatio.toFixed(4)),
        sync_failure_ratio: Number(syncFailureRatio.toFixed(4)),
        offline_ratio: Number(offlineRatio.toFixed(4))
      }
    },
    {
      name: "rollback_policy",
      severity: rollbackSeverity,
      status: rollbackSeverity === "ok" ? "healthy" : (rollbackSeverity as "warning" | "critical"),
      reason:
        rollbackSeverity === "critical"
          ? "rollback policy requires immediate exception review"
          : rollbackSeverity === "warning"
            ? "rollback policy requires approval before promotion"
            : "rollback policy is healthy",
      thresholds: {
        risk_score: 40,
        max_budget_burn_rate: 1.2
      },
      metrics: {
        risk_score: riskScore,
        max_budget_burn_rate: Number(maxBudgetBurnRate.toFixed(4))
      }
    },
    {
      name: "anomaly_remediation",
      severity: anomalySeverity,
      status: anomalySeverity === "ok" ? "healthy" : (anomalySeverity as "warning" | "critical"),
      reason:
        anomalySeverity === "critical"
          ? "tenant anomalies exceed safe baseline"
          : anomalySeverity === "warning"
            ? "tenant anomalies need operator approval"
            : "anomaly baselines are within tolerance",
      thresholds: {
        failure_ratio_multiplier: 1.7,
        error_rate_multiplier: 1.3
      },
      metrics: {
        tenant_failure_ratio: Number(commandFailureRatio.toFixed(4)),
        global_failure_ratio: Number(globalFailureRatio.toFixed(4)),
        tenant_error_rate_percent: Number(errorRatePercent.toFixed(2)),
        global_error_rate_percent: Number(globalErrorRatePercent.toFixed(2))
      }
    }
  ];

  const activePolicies =
    policyScope === "all"
      ? policyEvaluations
      : policyEvaluations.filter((item) => {
          if (policyScope === "rollout") {
            return item.name === "rollout_guardrail";
          }
          if (policyScope === "rollback") {
            return item.name === "rollback_policy";
          }
          return item.name === "anomaly_remediation";
        });

  const exceptions = activePolicies
    .filter((item) => item.severity !== "ok")
    .map((item) =>
      buildException(
        item.name as GovernanceException["policy"],
        item.severity as "warning" | "critical",
        item.reason,
        {
          thresholds: item.thresholds,
          metrics: item.metrics
        }
      )
    );

  const criticalExceptions = exceptions.filter((item) => item.severity === "critical");
  const warningExceptions = exceptions.filter((item) => item.severity === "warning");

  const decision: "promote" | "hold" | "block" =
    criticalExceptions.length > 0 ? "block" : warningExceptions.length > 0 ? "hold" : "promote";

  const workflowStatus: GovernanceEvaluation["workflow"]["status"] =
    exceptions.length === 0 ? "cleared" : criticalExceptions.length > 0 ? "requires_exception" : "pending_approval";

  const requiredApprovals = Array.from(new Set(exceptions.flatMap((item) => item.required_approvals)));

  return {
    tenant_id: tenantId,
    as_of: new Date().toISOString(),
    window_minutes: windowMinutes,
    policy_scope: policyScope,
    issue_mode: issueMode,
    decision,
    workflow: {
      status: workflowStatus,
      traceable_exceptions: exceptions.length,
      required_approvals: requiredApprovals
    },
    policies: activePolicies,
    exceptions,
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
        failure_ratio: Number(commandFailureRatio.toFixed(4)),
        success_rate: Number(commandSuccessRate.toFixed(4))
      },
      telemetry: {
        error_events: errorEvents,
        error_rate_percent: Number(errorRatePercent.toFixed(2)),
        sync_total: syncEvents.length,
        sync_failure_count: syncFailureCount,
        sync_failure_ratio: Number(syncFailureRatio.toFixed(4))
      },
      risk: {
        score: riskScore,
        max_budget_burn_rate: Number(maxBudgetBurnRate.toFixed(4))
      }
    }
  };
}