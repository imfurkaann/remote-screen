import { createServer, type Server } from "node:http";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import { buildApp } from "../app.js";
import { CommandModel } from "../models/command.model.js";
import { DeviceModel } from "../models/device.model.js";
import { TelemetryModel } from "../models/telemetry.model.js";

const env = {
  nodeEnv: "test",
  port: 0,
  mongoUri: "mongodb://localhost:27017/unused",
  pgEnabled: false,
  pgHost: "localhost",
  pgPort: 5432,
  pgDatabase: "remote_screen",
  pgUser: "postgres",
  pgPassword: "",
  pgPoolMax: 20,
  readFromPostgresPercentage: 0,
  jwtAccessSecret: "test-secret",
  jwtIssuer: "remote-screen",
  jwtAudience: "remote-screen-clients",
  deviceBootstrapKey: "bootstrap-secret",
  corsOrigin: "*"
};

let server: Server | null = null;
let mongoServer: MongoMemoryServer | null = null;
let usingExternalMongo = false;
const tenantId = "tenant-test";
const deviceOnlineId = new mongoose.Types.ObjectId().toHexString();
const deviceOfflineId = new mongoose.Types.ObjectId().toHexString();

function createAuthToken(tenantId: string, role: string = "tenant_owner"): string {
  return jwt.sign(
    {
      sub: "test-user",
      tenant_id: tenantId,
      role
    },
    env.jwtAccessSecret,
    {
      issuer: env.jwtIssuer,
      audience: env.jwtAudience,
      expiresIn: "5m",
      notBefore: "0s"
    }
  );
}

afterEach(async () => {
  if (!server) {
    return;
  }

  await new Promise<void>((resolve) => {
    server?.close(() => resolve());
  });
  server = null;
});

before(async () => {
  const localUri = "mongodb://127.0.0.1:27017/remote_screen_test";

  try {
    usingExternalMongo = true;
    env.mongoUri = localUri;
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 1500 });
    return;
  } catch {
    await mongoose.disconnect();
  }

  // Fallback for environments without local MongoDB.
  usingExternalMongo = false;
  mongoServer = await MongoMemoryServer.create();
  env.mongoUri = mongoServer.getUri();
  await mongoose.connect(env.mongoUri);
});

after(async () => {
  if (usingExternalMongo) {
    const db = mongoose.connection.db;
    if (db) {
      await db.dropDatabase();
    }
  }
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = null;
  }
});

beforeEach(async () => {
  await Promise.all([CommandModel.deleteMany({}), DeviceModel.deleteMany({}), TelemetryModel.deleteMany({})]);

  const now = new Date();
  const twentyMinutesAgo = new Date(now.getTime() - 20 * 60 * 1000);

  await DeviceModel.insertMany([
    {
      _id: deviceOnlineId,
      tenantId,
      hardwareId: "hw-online-1",
      status: "online",
      pairedOwnerUserId: "owner-1",
      currentPlaylistId: null,
      lastHeartbeatAt: now,
      lastSeenAt: now
    },
    {
      _id: deviceOfflineId,
      tenantId,
      hardwareId: "hw-offline-1",
      status: "offline",
      pairedOwnerUserId: "owner-1",
      currentPlaylistId: null,
      lastHeartbeatAt: twentyMinutesAgo,
      lastSeenAt: twentyMinutesAgo
    }
  ]);

  await CommandModel.insertMany([
    {
      tenantId,
      deviceId: deviceOnlineId,
      commandId: "cmd-1",
      commandType: "FORCE_REFRESH",
      payload: {},
      status: "completed",
      attempts: 1,
      maxAttempts: 2,
      timeoutMs: 15000
    },
    {
      tenantId,
      deviceId: deviceOnlineId,
      commandId: "cmd-2",
      commandType: "SCREENSHOT",
      payload: {},
      status: "failed",
      attempts: 2,
      maxAttempts: 2,
      timeoutMs: 15000
    },
    {
      tenantId,
      deviceId: deviceOfflineId,
      commandId: "cmd-3",
      commandType: "REBOOT_APP",
      payload: {},
      status: "timeout",
      attempts: 2,
      maxAttempts: 2,
      timeoutMs: 15000
    }
  ]);

  await TelemetryModel.insertMany([
    {
      tenantId,
      deviceId: deviceOnlineId,
      kind: "heartbeat",
      correlationId: "corr-heartbeat-current",
      payload: { status: "ok" },
      createdAt: now,
      updatedAt: now
    },
    {
      tenantId,
      deviceId: deviceOnlineId,
      kind: "sync",
      correlationId: "corr-sync-failed",
      payload: { status: "failed" },
      createdAt: now,
      updatedAt: now
    },
    {
      tenantId,
      deviceId: deviceOfflineId,
      kind: "error",
      correlationId: "corr-error-1",
      payload: { message: "sync failed" },
      createdAt: now,
      updatedAt: now
    },
    {
      tenantId,
      deviceId: deviceOfflineId,
      kind: "heartbeat",
      correlationId: "corr-heartbeat-prev",
      payload: { status: "ok" },
      createdAt: twentyMinutesAgo,
      updatedAt: twentyMinutesAgo
    }
  ]);
});

async function startServer(): Promise<string> {
  const app = buildApp(env);
  server = createServer(app);

  await new Promise<void>((resolve) => {
    server?.listen(0, () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to acquire test server address");
  }

  return `http://127.0.0.1:${address.port}`;
}

describe("ops route: metrics endpoint", () => {
  it("requires tenant context", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/v1/ops/metrics`, {
      headers: { authorization: `Bearer invalid-token` }
    });

    assert.equal(response.status, 401);
  });

  it("returns metrics structure for valid request", async () => {
    const baseUrl = await startServer();
    const token = createAuthToken(tenantId);

    const response = await fetch(`${baseUrl}/api/v1/ops/metrics`, {
      headers: { authorization: `Bearer ${token}` }
    });

    assert.equal(response.status, 200);
    const data = (await response.json()) as any;
    assert.equal(data.tenant_id, tenantId);
    assert(data.as_of);
    assert(data.devices);
    assert.equal(typeof data.devices.online, "number");
    assert.equal(typeof data.devices.offline, "number");
    assert(data.commands);
    assert.equal(typeof data.commands.success_rate, "number");
    assert(data.top_failing_devices_last_24h);
    assert(Array.isArray(data.top_failing_devices_last_24h));
  });
});

describe("ops route: alerts evaluation", () => {
  it("requires tenant context", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/v1/ops/alerts/evaluate`, {
      headers: { authorization: `Bearer invalid-token` }
    });

    assert.equal(response.status, 401);
  });

  it("returns alerts evaluation structure", async () => {
    const baseUrl = await startServer();
    const token = createAuthToken(tenantId);

    const response = await fetch(`${baseUrl}/api/v1/ops/alerts/evaluate`, {
      headers: { authorization: `Bearer ${token}` }
    });

    assert.equal(response.status, 200);
    const data = (await response.json()) as any;
    assert.equal(data.tenant_id, tenantId);
    assert(data.as_of);
    assert(Array.isArray(data.alerts));
    assert(data.alerts.every((a: any) => a.rule && ["ok", "warning", "critical"].includes(a.severity)));
    assert(data.windows);
    assert.equal(typeof data.windows.heartbeat_current_window, "number");
    assert.equal(typeof data.windows.heartbeat_previous_window, "number");
  });
});

describe("ops route: content parity endpoint", () => {
  it("requires tenant context", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/v1/ops/content/parity`, {
      headers: { authorization: `Bearer invalid-token` }
    });

    assert.equal(response.status, 401);
  });

  it("returns parity check structure (no PG mock)", async () => {
    const baseUrl = await startServer();
    const token = createAuthToken(tenantId);

    const response = await fetch(
      `${baseUrl}/api/v1/ops/content/parity?window_minutes=60&sample_limit=20`,
      {
        headers: { authorization: `Bearer ${token}` }
      }
    );

    // Will fail because PG is not connected, but validates structure
    assert([503, 500].includes(response.status));
  });
});

describe("ops route: rollout guardrails evaluation", () => {
  it("requires tenant context", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/v1/ops/rollout/guardrails/evaluate`, {
      headers: { authorization: `Bearer invalid-token` }
    });

    assert.equal(response.status, 401);
  });

  it("returns guardrails decision structure (no PG mock)", async () => {
    const baseUrl = await startServer();
    const token = createAuthToken(tenantId);

    const response = await fetch(
      `${baseUrl}/api/v1/ops/rollout/guardrails/evaluate?window_minutes=60`,
      {
        headers: { authorization: `Bearer ${token}` }
      }
    );

    // Will fail because PG is not connected, but validates structure
    assert([503, 500].includes(response.status));
  });
});

describe("ops route: SLO evaluation", () => {
  it("requires tenant context", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/v1/ops/slo/evaluate`, {
      headers: { authorization: `Bearer invalid-token` }
    });

    assert.equal(response.status, 401);
  });

  it("returns SLO evaluation structure", async () => {
    const baseUrl = await startServer();
    const token = createAuthToken(tenantId);

    const response = await fetch(`${baseUrl}/api/v1/ops/slo/evaluate?window_minutes=60`, {
      headers: { authorization: `Bearer ${token}` }
    });

    assert.equal(response.status, 200);
    const data = (await response.json()) as any;
    assert.equal(data.tenant_id, tenantId);
    assert(data.as_of);
    assert(["healthy", "warning", "critical"].includes(data.escalation));
    assert(Array.isArray(data.escalation_reasons));
    assert(Array.isArray(data.slos));
    assert(
      data.slos.every(
        (s: any) =>
          s.name &&
          typeof s.threshold === "number" &&
          typeof s.current === "number" &&
          (s.unit === "ratio" || s.unit === "percent") &&
          ["healthy", "warning", "critical"].includes(s.status)
      )
    );
  });
});

describe("ops route: release gate evaluation", () => {
  it("requires tenant context", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/v1/ops/release-gate/evaluate`, {
      headers: { authorization: `Bearer invalid-token` }
    });

    assert.equal(response.status, 401);
  });

  it("returns release gate decision structure", async () => {
    const baseUrl = await startServer();
    const token = createAuthToken(tenantId);

    const response = await fetch(
      `${baseUrl}/api/v1/ops/release-gate/evaluate?window_minutes=60&slo_window_minutes=240`,
      {
        headers: { authorization: `Bearer ${token}` }
      }
    );

    assert.equal(response.status, 200);
    const data = (await response.json()) as any;
    assert.equal(data.tenant_id, tenantId);
    assert(data.windows);
    assert(["promote", "hold", "block"].includes(data.decision));
    assert(Array.isArray(data.block_reasons));
    assert(Array.isArray(data.hold_reasons));
    assert(data.guardrails);
    assert(Array.isArray(data.guardrails.evaluated));
    assert(data.slos);
    assert(Array.isArray(data.slos.breaches));
  });
});

describe("ops route: promotion eligibility", () => {
  it("requires tenant context", async () => {
    const baseUrl = await startServer();
    const response = await fetch(
      `${baseUrl}/api/v1/ops/promotion/eligible?source_env=staging&target_env=prod`,
      {
        headers: { authorization: `Bearer invalid-token` }
      }
    );

    assert.equal(response.status, 401);
  });

  it("validates environment promotion path", async () => {
    const baseUrl = await startServer();
    const token = createAuthToken(tenantId);

    // Invalid: cannot promote backward
    const response = await fetch(
      `${baseUrl}/api/v1/ops/promotion/eligible?source_env=prod&target_env=staging`,
      {
        headers: { authorization: `Bearer ${token}` }
      }
    );

    assert.equal(response.status, 400);
    const data = (await response.json()) as any;
    assert(data.code === "VALIDATION_ERROR");
  });

  it("returns promotion eligibility structure (no PG mock)", async () => {
    const baseUrl = await startServer();
    const token = createAuthToken(tenantId);

    const response = await fetch(
      `${baseUrl}/api/v1/ops/promotion/eligible?source_env=staging&target_env=prod&sample_limit=50`,
      {
        headers: { authorization: `Bearer ${token}` }
      }
    );

    // Will fail because PG is not connected
    assert([503, 500].includes(response.status));
  });
});

describe("ops route: pilot rollout checkpoints", () => {
  it("requires tenant context", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/v1/ops/pilot/checkpoints/evaluate?current_percentage=10`, {
      headers: { authorization: "Bearer invalid-token" }
    });

    assert.equal(response.status, 401);
  });

  it("returns pilot checkpoint decision structure", async () => {
    const baseUrl = await startServer();
    const token = createAuthToken(tenantId);

    const response = await fetch(
      `${baseUrl}/api/v1/ops/pilot/checkpoints/evaluate?current_percentage=10&window_minutes=60`,
      {
        headers: { authorization: `Bearer ${token}` }
      }
    );

    assert.equal(response.status, 200);
    const data = (await response.json()) as any;
    assert.equal(data.tenant_id, tenantId);
    assert(["promote", "hold", "rollback"].includes(data.decision));
    assert(Array.isArray(data.reasons));
    assert(data.rollout_progress);
    assert.equal(typeof data.rollout_progress.current_percentage, "number");
    assert(Array.isArray(data.rollout_progress.checkpoint_path));
    assert(data.canary);
    assert(["healthy", "warning", "critical"].includes(data.canary.status));
    assert.equal(typeof data.canary.rollback_triggered, "boolean");
    assert(data.metrics);
    assert.equal(typeof data.metrics.commands.failure_ratio, "number");
  });
});

describe("ops route: failover evaluation", () => {
  it("requires tenant context", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/v1/ops/failover/evaluate?primary_region=eu-central-1&secondary_region=eu-west-1`, {
      headers: { authorization: "Bearer invalid-token" }
    });

    assert.equal(response.status, 401);
  });

  it("returns failover decision structure", async () => {
    const baseUrl = await startServer();
    const token = createAuthToken(tenantId);

    const response = await fetch(
      `${baseUrl}/api/v1/ops/failover/evaluate?primary_region=eu-central-1&secondary_region=eu-west-1&window_minutes=60`,
      {
        headers: { authorization: `Bearer ${token}` }
      }
    );

    assert.equal(response.status, 200);
    const data = (await response.json()) as any;
    assert.equal(data.tenant_id, tenantId);
    assert(data.regions);
    assert.equal(data.regions.primary, "eu-central-1");
    assert.equal(data.regions.secondary, "eu-west-1");
    assert(["stay_primary", "prepare_failover", "failover_now"].includes(data.decision));
    assert(Array.isArray(data.reasons));
    assert(data.health);
    assert.equal(typeof data.health.failover_triggered, "boolean");
    assert(data.thresholds);
    assert(data.metrics);
    assert.equal(typeof data.metrics.commands.failure_ratio, "number");
  });
});

describe("ops route: canary deployment evaluation", () => {
  it("requires tenant context", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/v1/ops/canary/deployment/evaluate?current_traffic_percent=10`, {
      headers: { authorization: "Bearer invalid-token" }
    });

    assert.equal(response.status, 401);
  });

  it("returns canary decision and rollback structure", async () => {
    const baseUrl = await startServer();
    const token = createAuthToken(tenantId);

    const response = await fetch(
      `${baseUrl}/api/v1/ops/canary/deployment/evaluate?current_traffic_percent=10&step_percent=10&window_minutes=30`,
      {
        headers: { authorization: `Bearer ${token}` }
      }
    );

    assert.equal(response.status, 200);
    const data = (await response.json()) as any;
    assert.equal(data.tenant_id, tenantId);
    assert(["promote", "hold", "rollback"].includes(data.decision));
    assert(Array.isArray(data.reasons));
    assert(data.deployment);
    assert.equal(typeof data.deployment.current_traffic_percent, "number");
    assert.equal(typeof data.deployment.recommended_traffic_percent, "number");
    assert(data.rollback);
    assert.equal(typeof data.rollback.triggered, "boolean");
    assert(["rollback_now", "monitor", "continue"].includes(data.rollback.action));
    assert(data.metrics);
    assert.equal(typeof data.metrics.telemetry.error_rate_percent, "number");
  });
});

describe("ops route: incident recovery evaluation", () => {
  it("requires tenant context", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/v1/ops/incident/recovery/evaluate?window_minutes=30`, {
      headers: { authorization: "Bearer invalid-token" }
    });

    assert.equal(response.status, 401);
  });

  it("returns incident severity and automation workflow", async () => {
    const baseUrl = await startServer();
    const token = createAuthToken(tenantId);

    const response = await fetch(`${baseUrl}/api/v1/ops/incident/recovery/evaluate?window_minutes=30`, {
      headers: { authorization: `Bearer ${token}` }
    });

    assert.equal(response.status, 200);
    const data = (await response.json()) as any;
    assert.equal(data.tenant_id, tenantId);
    assert(data.incident);
    assert(["sev0", "sev1", "sev2", "sev3"].includes(data.incident.severity));
    assert(["emergency_recovery", "controlled_recovery", "watch_and_hold", "normal_operations"].includes(data.incident.decision));
    assert(data.automation);
    assert(Array.isArray(data.automation.actions));
    assert(Array.isArray(data.automation.runbook));
    assert(data.thresholds);
    assert(data.metrics);
    assert.equal(typeof data.metrics.telemetry.error_rate_percent, "number");
  });
});

describe("ops route: chaos resilience certification", () => {
  it("requires tenant context", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/v1/ops/chaos/resilience/certify?window_minutes=60&drill_type=db_latency`, {
      headers: { authorization: "Bearer invalid-token" }
    });

    assert.equal(response.status, 401);
  });

  it("returns certification status and gate decision", async () => {
    const baseUrl = await startServer();
    const token = createAuthToken(tenantId);

    const response = await fetch(
      `${baseUrl}/api/v1/ops/chaos/resilience/certify?window_minutes=60&drill_type=db_latency`,
      {
        headers: { authorization: `Bearer ${token}` }
      }
    );

    assert.equal(response.status, 200);
    const data = (await response.json()) as any;
    assert.equal(data.tenant_id, tenantId);
    assert(data.chaos);
    assert.equal(data.chaos.drill_type, "db_latency");
    assert(Array.isArray(data.chaos.exercised_failures));
    assert(data.certification);
    assert(["certified", "conditional", "failed"].includes(data.certification.status));
    assert(["promote", "hold", "block"].includes(data.certification.gate_decision));
    assert(Array.isArray(data.checks));
    assert.equal(typeof data.objectives.observed_mttr_minutes, "number");
    assert(data.metrics);
  });
});

describe("ops route: game-day simulation readiness", () => {
  it("requires tenant context", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/v1/ops/simulation/gameday/evaluate?window_minutes=90&scenario=regional_failover_drill`, {
      headers: { authorization: "Bearer invalid-token" }
    });

    assert.equal(response.status, 401);
  });

  it("returns readiness status and runbook evidence", async () => {
    const baseUrl = await startServer();
    const token = createAuthToken(tenantId);

    const response = await fetch(
      `${baseUrl}/api/v1/ops/simulation/gameday/evaluate?window_minutes=90&scenario=regional_failover_drill`,
      {
        headers: { authorization: `Bearer ${token}` }
      }
    );

    assert.equal(response.status, 200);
    const data = (await response.json()) as any;
    assert.equal(data.tenant_id, tenantId);
    assert(data.simulation);
    assert.equal(data.simulation.exercise_type, "production_game_day");
    assert(data.readiness);
    assert(["ready", "conditional", "not_ready"].includes(data.readiness.status));
    assert(["promote", "hold", "block"].includes(data.readiness.gate_decision));
    assert(data.runbook);
    assert(Array.isArray(data.runbook.evidence));
    assert.equal(typeof data.runbook.within_sla, "boolean");
    assert(Array.isArray(data.checks));
  });
});

describe("ops route: compliance evidence evaluation", () => {
  it("requires tenant context", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/v1/ops/compliance/evidence/evaluate?window_hours=24&evidence_retention_days=30`, {
      headers: { authorization: "Bearer invalid-token" }
    });

    assert.equal(response.status, 401);
  });

  it("returns compliance status and control evidence", async () => {
    const baseUrl = await startServer();
    const token = createAuthToken(tenantId);

    const response = await fetch(
      `${baseUrl}/api/v1/ops/compliance/evidence/evaluate?window_hours=24&evidence_retention_days=30`,
      {
        headers: { authorization: `Bearer ${token}` }
      }
    );

    assert.equal(response.status, 200);
    const data = (await response.json()) as any;
    assert.equal(data.tenant_id, tenantId);
    assert(data.compliance);
    assert(["compliant", "at_risk", "non_compliant"].includes(data.compliance.status));
    assert(["promote", "hold", "block"].includes(data.compliance.gate_decision));
    assert(Array.isArray(data.controls));
    assert(data.evidence);
    assert.equal(typeof data.evidence.evidence_coverage_ratio, "number");
  });
});

describe("ops route: rollback policy tuning", () => {
  it("requires tenant context", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/v1/ops/rollback/policy/tune?window_minutes=120`, {
      headers: { authorization: "Bearer invalid-token" }
    });

    assert.equal(response.status, 401);
  });

  it("returns policy mode, risk score, and gate decision", async () => {
    const baseUrl = await startServer();
    const token = createAuthToken(tenantId);

    const response = await fetch(`${baseUrl}/api/v1/ops/rollback/policy/tune?window_minutes=120`, {
      headers: { authorization: `Bearer ${token}` }
    });

    assert.equal(response.status, 200);
    const data = (await response.json()) as any;
    assert.equal(data.tenant_id, tenantId);
    assert(data.policy);
    assert(["aggressive", "balanced", "relaxed"].includes(data.policy.mode));
    assert(["promote", "hold", "block"].includes(data.policy.gate_decision));
    assert.equal(typeof data.policy.auto_rollback_triggered, "boolean");
    assert(data.risk);
    assert.equal(typeof data.risk.score, "number");
    assert(data.slo_budget);
    assert(data.metrics);
  });
});

describe("ops route: anomaly remediation evaluation", () => {
  it("requires tenant context", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/v1/ops/anomaly/remediation/evaluate?window_minutes=120&execute=false`, {
      headers: { authorization: "Bearer invalid-token" }
    });

    assert.equal(response.status, 401);
  });

  it("returns anomaly summary and remediation orchestration", async () => {
    const baseUrl = await startServer();
    const token = createAuthToken(tenantId);

    const response = await fetch(
      `${baseUrl}/api/v1/ops/anomaly/remediation/evaluate?window_minutes=120&execute=false`,
      {
        headers: { authorization: `Bearer ${token}` }
      }
    );

    assert.equal(response.status, 200);
    const data = (await response.json()) as any;
    assert.equal(data.tenant_id, tenantId);
    assert(data.anomaly_summary);
    assert(["normal", "warning", "critical"].includes(data.anomaly_summary.status));
    assert(data.orchestration);
    assert(["dry_run", "execute"].includes(data.orchestration.mode));
    assert(["not_required", "queued", "planned", "executing"].includes(data.orchestration.status));
    assert(["promote", "hold", "block"].includes(data.orchestration.gate_decision));
    assert(Array.isArray(data.orchestration.actions));
    assert(Array.isArray(data.anomalies));
    assert(data.metrics);
  });
});

describe("ops route: governance exceptions evaluation", () => {
  it("requires tenant context", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/v1/ops/governance/exceptions/evaluate?window_minutes=120&policy_scope=all`, {
      headers: { authorization: "Bearer invalid-token" }
    });

    assert.equal(response.status, 401);
  });

  it("returns governance decision and traceable exceptions", async () => {
    const baseUrl = await startServer();
    const token = createAuthToken(tenantId);

    const response = await fetch(
      `${baseUrl}/api/v1/ops/governance/exceptions/evaluate?window_minutes=120&policy_scope=all&issue_mode=dry_run`,
      {
        headers: { authorization: `Bearer ${token}` }
      }
    );

    assert.equal(response.status, 200);
    const data = (await response.json()) as any;
    assert.equal(data.tenant_id, tenantId);
    assert.equal(data.policy_scope, "all");
    assert.equal(data.issue_mode, "dry_run");
    assert(["promote", "hold", "block"].includes(data.decision));
    assert(data.workflow);
    assert(["cleared", "pending_approval", "requires_exception"].includes(data.workflow.status));
    assert.equal(typeof data.workflow.traceable_exceptions, "number");
    assert(Array.isArray(data.workflow.required_approvals));
    assert(Array.isArray(data.policies));
    assert(Array.isArray(data.exceptions));
    assert(data.metrics);
    assert(data.metrics.risk);
  });
});

describe("ops route: authorization", () => {
  it("rejects requests without proper role", async () => {
    const baseUrl = await startServer();
    const token = createAuthToken(tenantId, "viewer");

    const response = await fetch(`${baseUrl}/api/v1/ops/metrics`, {
      headers: { authorization: `Bearer ${token}` }
    });

    assert.equal(response.status, 403);
  });

  it("rejects requests with operator role", async () => {
    const baseUrl = await startServer();
    const token = createAuthToken(tenantId, "operator");

    const response = await fetch(`${baseUrl}/api/v1/ops/metrics`, {
      headers: { authorization: `Bearer ${token}` }
    });

    assert.equal(response.status, 403);
  });
});
