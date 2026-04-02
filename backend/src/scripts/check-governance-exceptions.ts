import { getEnv } from "../config/env.js";
import { connectMongo, disconnectMongo } from "../lib/mongo.js";
import { evaluateGovernancePolicy, type GovernanceIssueMode, type GovernancePolicyScope } from "../services/governance.service.js";

function requireTenantId(): string {
  const tenantId = process.env.CHECK_TENANT_ID;
  if (!tenantId) {
    throw new Error("CHECK_TENANT_ID env var is required");
  }
  return tenantId;
}

function getWindowMinutes(): number {
  const raw = Number(process.env.CHECK_WINDOW_MINUTES ?? 120);
  return Math.min(Math.max(Number.isFinite(raw) ? raw : 120, 10), 1440);
}

function getPolicyScope(): GovernancePolicyScope {
  const scope = String(process.env.GOVERNANCE_POLICY_SCOPE ?? "all").trim().toLowerCase();
  if (!["all", "rollout", "rollback", "remediation"].includes(scope)) {
    throw new Error("GOVERNANCE_POLICY_SCOPE must be one of all, rollout, rollback, remediation");
  }
  return scope as GovernancePolicyScope;
}

function getIssueMode(): GovernanceIssueMode {
  const mode = String(process.env.GOVERNANCE_ISSUE_MODE ?? "dry_run").trim().toLowerCase();
  if (!["dry_run", "issue"].includes(mode)) {
    throw new Error("GOVERNANCE_ISSUE_MODE must be dry_run or issue");
  }
  return mode as GovernanceIssueMode;
}

async function run(): Promise<void> {
  const env = getEnv();
  const tenantId = requireTenantId();
  const windowMinutes = getWindowMinutes();
  const policyScope = getPolicyScope();
  const issueMode = getIssueMode();

  await connectMongo(env.mongoUri);

  const report = await evaluateGovernancePolicy({
    tenantId,
    windowMinutes,
    policyScope,
    issueMode
  });

  console.log(JSON.stringify(report, null, 2));

  if (report.decision === "block") {
    process.exitCode = 2;
  } else if (report.decision === "hold") {
    process.exitCode = 1;
  }

  await disconnectMongo();
}

run().catch(async (error) => {
  console.error("[check-governance-exceptions] failed", error);
  try {
    await disconnectMongo();
  } catch {
    // ignore
  }
  process.exitCode = 1;
});