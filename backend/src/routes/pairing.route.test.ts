import { createServer, type Server } from "node:http";
import { after, before, afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import { buildApp } from "../app.js";
import { TenantModel } from "../models/tenant.model.js";
import { UserModel } from "../models/user.model.js";
import { DeviceModel } from "../models/device.model.js";

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

before(async () => {
  const localUri = "mongodb://127.0.0.1:27017/remote_screen_test_pairing";

  try {
    usingExternalMongo = true;
    env.mongoUri = localUri;
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 1500 });
    return;
  } catch {
    await mongoose.disconnect();
  }

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

afterEach(async () => {
  if (!server) {
    return;
  }

  await new Promise<void>((resolve) => {
    server?.close(() => resolve());
  });
  server = null;
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

describe("pairing abuse protections", () => {
  it("blocks request-code without bootstrap key", async () => {
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/v1/pairing/request-code`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hardware_id: "hw-1", tenant_id: "tenant-demo" })
    });

    assert.equal(response.status, 401);
    const expectedFingerprint = createHash("sha256")
      .update(env.deviceBootstrapKey, "utf8")
      .digest("hex")
      .slice(0, 12);
    assert.equal(response.headers.get("x-device-bootstrap-fingerprint"), expectedFingerprint);
    const payload = (await response.json()) as { code: string };
    assert.equal(payload.code, "BOOTSTRAP_UNAUTHORIZED");
  });

  it("blocks confirm without user token", async () => {
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/v1/pairing/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pairing_code: "123456" })
    });

    assert.equal(response.status, 401);
  });

  it("blocks confirm for disallowed role", async () => {
    const baseUrl = await startServer();
    const token = jwt.sign(
      {
        sub: "user-demo",
        tenant_id: "tenant-demo",
        role: "viewer"
      },
      env.jwtAccessSecret,
      {
        issuer: env.jwtIssuer,
        audience: env.jwtAudience,
        notBefore: "0s",
        expiresIn: "5m"
      }
    );

    const response = await fetch(`${baseUrl}/api/v1/pairing/confirm`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ pairing_code: "123456" })
    });

    assert.equal(response.status, 403);
  });

  it("rate limits repeated request-code attempts", async () => {
    const baseUrl = await startServer();

    let lastStatus = 200;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await fetch(`${baseUrl}/api/v1/pairing/request-code`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-device-bootstrap-key": env.deviceBootstrapKey
        },
        // Keep payload invalid to avoid touching Mongo while still exercising rate limiting.
        body: JSON.stringify({})
      });
      lastStatus = response.status;
      if (response.status === 429) {
        break;
      }
    }

    assert.equal(lastStatus, 429);
  });

  it("persists device hardware_id and pairing code expiration on request-code", async () => {
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/v1/pairing/request-code`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-device-bootstrap-key": env.deviceBootstrapKey
      },
      body: JSON.stringify({
        hardware_id: "hw-persist-1",
        tenant_id: "tenant-demo",
        device_proof: "test-device-proof-0123456789abcdef"
      })
    });

    assert.equal(response.status, 201);

    const payload = (await response.json()) as {
      code: string;
      expires_at: string;
      device_id: string;
    };

    assert.equal(payload.code.length, 6);
    assert.match(payload.expires_at, /Z$/);
    assert.equal(payload.device_id.length > 0, true);
  });

  it("issues a short-lived dashboard-only socket ticket", async () => {
    const baseUrl = await startServer();
    const accessToken = jwt.sign(
      { sub: "socket-user-test", tenant_id: "tenant-socket-test", role: "operator" },
      env.jwtAccessSecret,
      { issuer: env.jwtIssuer, audience: env.jwtAudience, expiresIn: "1h" }
    );

    const response = await fetch(`${baseUrl}/api/v1/auth/socket-ticket`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: "{}"
    });
    assert.equal(response.status, 200);

    const payload = (await response.json()) as { ticket: string; expires_in: number };
    const decoded = jwt.verify(payload.ticket, env.jwtAccessSecret, {
      issuer: env.jwtIssuer,
      audience: env.jwtAudience
    }) as jwt.JwtPayload & { scope?: string };

    assert.equal(payload.expires_in, 300);
    assert.equal(decoded.scope, "dashboard_socket");
    assert.equal(decoded.sub, "socket-user-test");
    assert.ok((decoded.exp ?? 0) - (decoded.iat ?? 0) <= 300);
  });
  it("issues a socket ticket for a persisted ObjectId user without recompiling models", async () => {
    const baseUrl = await startServer();
    const tenantId = "tenant-object-id-socket-test";
    await TenantModel.create({
      _id: tenantId,
      name: "Socket Ticket Tenant",
      nameKey: tenantId,
      isActive: true
    });
    const user = await UserModel.create({
      tenantId,
      email: "object-id-socket@example.test",
      passwordHash: "x".repeat(60),
      role: "operator",
      displayName: "Socket Operator",
      isActive: true
    });
    const accessToken = jwt.sign(
      { sub: String(user._id), tenant_id: tenantId, role: "operator" },
      env.jwtAccessSecret,
      { issuer: env.jwtIssuer, audience: env.jwtAudience, expiresIn: "1h" }
    );

    const response = await fetch(`${baseUrl}/api/v1/auth/socket-ticket`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: "{}"
    });

    assert.equal(response.status, 200);
    const payload = (await response.json()) as { ticket: string };
    assert.ok(payload.ticket);
  });
  it("keeps a replacement device proof pending until a user confirms the physical code", async () => {
    const baseUrl = await startServer();
    const headers = {
      "content-type": "application/json",
      "x-device-bootstrap-key": env.deviceBootstrapKey
    };
    const firstProof = "first-device-proof-0123456789abcdef";
    const replacementProof = "other-device-proof-0123456789abcdef";

    const first = await fetch(`${baseUrl}/api/v1/pairing/request-code`, {
      method: "POST",
      headers,
      body: JSON.stringify({ hardware_id: "hw-proof-lock-1", device_proof: firstProof })
    });
    assert.equal(first.status, 201);

    const replacement = await fetch(`${baseUrl}/api/v1/pairing/request-code`, {
      method: "POST",
      headers,
      body: JSON.stringify({ hardware_id: "hw-proof-lock-1", device_proof: replacementProof })
    });
    assert.equal(replacement.status, 201);
    const replacementPayload = (await replacement.json()) as { credential_recovery: boolean };
    assert.equal(replacementPayload.credential_recovery, true);

    const device = await DeviceModel.findOne({ hardwareId: "hw-proof-lock-1" })
      .select("+deviceCredentialHash")
      .lean();
    const firstHash = createHash("sha256").update(firstProof, "utf8").digest("hex");
    assert.equal(device?.deviceCredentialHash, firstHash);
  });

  it("requires authenticated unpair before a paired device can request a new code", async () => {
    const baseUrl = await startServer();
    const deviceProof = "paired-device-proof-0123456789abcdef";
    const deviceHeaders = {
      "content-type": "application/json",
      "x-device-bootstrap-key": env.deviceBootstrapKey
    };
    const requestCode = await fetch(`${baseUrl}/api/v1/pairing/request-code`, {
      method: "POST",
      headers: deviceHeaders,
      body: JSON.stringify({ hardware_id: "hw-paired-lock-1", device_proof: deviceProof })
    });
    assert.equal(requestCode.status, 201);
    const { code } = (await requestCode.json()) as { code: string };

    const userToken = jwt.sign(
      { sub: "operator-proof-test", tenant_id: "tenant-proof-test", role: "operator" },
      env.jwtAccessSecret,
      { issuer: env.jwtIssuer, audience: env.jwtAudience, expiresIn: "5m" }
    );
    const confirm = await fetch(`${baseUrl}/api/v1/pairing/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${userToken}` },
      body: JSON.stringify({ pairing_code: code })
    });
    assert.equal(confirm.status, 200);
    const pairedDevice = await DeviceModel.findOne({ hardwareId: "hw-paired-lock-1" }).lean();
    assert.equal(pairedDevice?.status, "offline");
    assert.equal(pairedDevice?.lastHeartbeatAt ?? null, null);

    const reenroll = await fetch(`${baseUrl}/api/v1/pairing/request-code`, {
      method: "POST",
      headers: deviceHeaders,
      body: JSON.stringify({ hardware_id: "hw-paired-lock-1", device_proof: deviceProof })
    });
    assert.equal(reenroll.status, 409);
  });
  it("recovers a paired device after app reinstall and rejects the old proof", async () => {
    const baseUrl = await startServer();
    const firstProof = "installed-device-proof-0123456789abcdef";
    const replacementProof = "reinstalled-device-proof-0123456789abcdef";
    const deviceHeaders = {
      "content-type": "application/json",
      "x-device-bootstrap-key": env.deviceBootstrapKey
    };
    const userToken = jwt.sign(
      { sub: "operator-recovery", tenant_id: "tenant-recovery", role: "operator" },
      env.jwtAccessSecret,
      { issuer: env.jwtIssuer, audience: env.jwtAudience, expiresIn: "5m" }
    );

    const initialCodeResponse = await fetch(`${baseUrl}/api/v1/pairing/request-code`, {
      method: "POST",
      headers: deviceHeaders,
      body: JSON.stringify({ hardware_id: "hw-reinstall-recovery", device_proof: firstProof })
    });
    const initialCode = ((await initialCodeResponse.json()) as { code: string }).code;
    const initialConfirm = await fetch(`${baseUrl}/api/v1/pairing/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${userToken}` },
      body: JSON.stringify({ pairing_code: initialCode })
    });
    assert.equal(initialConfirm.status, 200);

    const recoveryCodeResponse = await fetch(`${baseUrl}/api/v1/pairing/request-code`, {
      method: "POST",
      headers: deviceHeaders,
      body: JSON.stringify({ hardware_id: "hw-reinstall-recovery", device_proof: replacementProof })
    });
    assert.equal(recoveryCodeResponse.status, 201);
    const recoveryPayload = (await recoveryCodeResponse.json()) as {
      code: string;
      credential_recovery: boolean;
    };
    assert.equal(recoveryPayload.credential_recovery, true);

    const recoveryConfirm = await fetch(`${baseUrl}/api/v1/pairing/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${userToken}` },
      body: JSON.stringify({ pairing_code: recoveryPayload.code })
    });
    assert.equal(recoveryConfirm.status, 200);
    const confirmed = (await recoveryConfirm.json()) as { credential_recovered: boolean };
    assert.equal(confirmed.credential_recovered, true);

    const newSession = await fetch(`${baseUrl}/api/v1/pairing/device-session`, {
      method: "POST",
      headers: deviceHeaders,
      body: JSON.stringify({ hardware_id: "hw-reinstall-recovery", device_proof: replacementProof })
    });
    assert.equal(newSession.status, 200);

    const oldSession = await fetch(`${baseUrl}/api/v1/pairing/device-session`, {
      method: "POST",
      headers: deviceHeaders,
      body: JSON.stringify({ hardware_id: "hw-reinstall-recovery", device_proof: firstProof })
    });
    assert.equal(oldSession.status, 401);
  });

  it("does not consume a recovery code when another tenant tries to claim it", async () => {
    const baseUrl = await startServer();
    const firstProof = "tenant-owner-proof-0123456789abcdef";
    const recoveryProof = "tenant-recovery-proof-0123456789abcdef";
    const deviceHeaders = {
      "content-type": "application/json",
      "x-device-bootstrap-key": env.deviceBootstrapKey
    };
    const ownerToken = jwt.sign(
      { sub: "operator-owner", tenant_id: "tenant-owner", role: "operator" },
      env.jwtAccessSecret,
      { issuer: env.jwtIssuer, audience: env.jwtAudience, expiresIn: "5m" }
    );
    const otherToken = jwt.sign(
      { sub: "operator-other", tenant_id: "tenant-other", role: "operator" },
      env.jwtAccessSecret,
      { issuer: env.jwtIssuer, audience: env.jwtAudience, expiresIn: "5m" }
    );

    const firstCodeResponse = await fetch(`${baseUrl}/api/v1/pairing/request-code`, {
      method: "POST",
      headers: deviceHeaders,
      body: JSON.stringify({ hardware_id: "hw-tenant-recovery", device_proof: firstProof })
    });
    const firstCode = ((await firstCodeResponse.json()) as { code: string }).code;
    await fetch(`${baseUrl}/api/v1/pairing/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ pairing_code: firstCode })
    });

    const recoveryCodeResponse = await fetch(`${baseUrl}/api/v1/pairing/request-code`, {
      method: "POST",
      headers: deviceHeaders,
      body: JSON.stringify({ hardware_id: "hw-tenant-recovery", device_proof: recoveryProof })
    });
    const recoveryCode = ((await recoveryCodeResponse.json()) as { code: string }).code;

    const foreignConfirm = await fetch(`${baseUrl}/api/v1/pairing/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${otherToken}` },
      body: JSON.stringify({ pairing_code: recoveryCode })
    });
    assert.equal(foreignConfirm.status, 409);

    const ownerConfirm = await fetch(`${baseUrl}/api/v1/pairing/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ pairing_code: recoveryCode })
    });
    assert.equal(ownerConfirm.status, 200);
  });
});
