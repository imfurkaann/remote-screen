import { createServer, type Server } from "node:http";
import { after, before, afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import { buildApp } from "../app.js";
import { TenantModel } from "../models/tenant.model.js";
import { UserModel } from "../models/user.model.js";

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
  const localUri = "mongodb://127.0.0.1:27017/remote_screen_test_super";

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
  if (server) {
    await new Promise<void>((resolve) => {
      server?.close(() => resolve());
    });
    server = null;
  }
  await TenantModel.deleteMany({});
  await UserModel.deleteMany({});
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

function createSuperAdminToken(): string {
  return jwt.sign(
    {
      sub: "super-id",
      tenant_id: "system",
      role: "super_admin",
      email: "superadmin@remotescreen.dev"
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

function createNormalUserToken(): string {
  return jwt.sign(
    {
      sub: "normal-id",
      tenant_id: "tenant-demo",
      role: "operator",
      email: "operator@remotescreen.dev"
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

function createTenantOwnerToken(userId: string, tenantId: string): string {
  return jwt.sign(
    {
      sub: userId,
      tenant_id: tenantId,
      role: "tenant_owner",
      email: "owner-new@test.com"
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

describe("super admin routes", () => {
  it("blocks requests without super_admin role", async () => {
    const baseUrl = await startServer();
    const token = createNormalUserToken();

    const response = await fetch(`${baseUrl}/api/v1/super/tenants`, {
      headers: {
        authorization: `Bearer ${token}`
      }
    });

    assert.equal(response.status, 403);
  });

  it("allows requests with super_admin role and creates a tenant", async () => {
    const baseUrl = await startServer();
    const token = createSuperAdminToken();

    // 1. Create a tenant
    const createRes = await fetch(`${baseUrl}/api/v1/super/tenants`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ name: "New Test Tenant" })
    });

    assert.equal(createRes.status, 201);
    const createData = (await createRes.json()) as any;
    assert.equal(createData.tenant.name, "New Test Tenant");
    assert.ok(createData.tenant._id);

    const tenantId = createData.tenant._id;

    const duplicateTenantRes = await fetch(baseUrl + "/api/v1/super/tenants", {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({ name: "  new test tenant  " })
    });
    assert.equal(duplicateTenantRes.status, 409);

    const elevatedUserRes = await fetch(baseUrl + "/api/v1/super/tenants/" + tenantId + "/users", {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({
        email: "illegal-super@test.com",
        password: "StrongPass123!",
        role: "super_admin",
        displayName: "Illegal Super"
      })
    });
    assert.equal(elevatedUserRes.status, 400);

    // 2. List tenants
    const listRes = await fetch(`${baseUrl}/api/v1/super/tenants`, {
      headers: {
        authorization: `Bearer ${token}`
      }
    });
    assert.equal(listRes.status, 200);
    const listData = (await listRes.json()) as any;
    assert.equal(listData.tenants.length, 1);
    assert.equal(listData.tenants[0].name, "New Test Tenant");

    // 3. Create a tenant user (owner)
    const userRes = await fetch(`${baseUrl}/api/v1/super/tenants/${tenantId}/users`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        email: "owner-new@test.com",
        password: "StrongPass123!",
        role: "tenant_owner",
        displayName: "New Tenant Owner"
      })
    });
    assert.equal(userRes.status, 201);
    const userData = (await userRes.json()) as any;
    assert.equal(userData.user.email, "owner-new@test.com");
    assert.equal(userData.user.role, "tenant_owner");

    const deactivateRes = await fetch(baseUrl + "/api/v1/super/tenants/" + tenantId, {
      method: "PUT",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({ isActive: false })
    });
    assert.equal(deactivateRes.status, 200);
    const deactivatedTenant = (await deactivateRes.json()) as any;
    assert.equal(deactivatedTenant.tenant.isActive, false);

    const reactivateRes = await fetch(baseUrl + "/api/v1/super/tenants/" + tenantId, {
      method: "PUT",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({ isActive: true })
    });
    assert.equal(reactivateRes.status, 200);

    const operatorRes = await fetch(baseUrl + "/api/v1/super/tenants/" + tenantId + "/users", {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({
        email: "operator-new@test.com",
        password: "StrongPass123!",
        role: "operator",
        displayName: "New Tenant Operator"
      })
    });
    assert.equal(operatorRes.status, 201);
    const operatorData = (await operatorRes.json()) as any;
    const ownerToken = createTenantOwnerToken(userData.user.id, tenantId);

    const unsafeDeactivateRes = await fetch(baseUrl + "/api/v1/auth/users/" + operatorData.user.id, {
      method: "PUT",
      headers: { authorization: "Bearer " + ownerToken, "content-type": "application/json" },
      body: JSON.stringify({ isActive: false })
    });
    assert.equal(unsafeDeactivateRes.status, 409);
    assert.equal(((await unsafeDeactivateRes.json()) as any).code, "USE_DEACTIVATION_ENDPOINT");

    const lastOwnerRes = await fetch(
      baseUrl + "/api/v1/auth/users/" + userData.user.id + "?transfer_to_user_id=" + operatorData.user.id,
      {
        method: "DELETE",
        headers: { authorization: "Bearer " + ownerToken }
      }
    );
    assert.equal(lastOwnerRes.status, 409);
    assert.equal(((await lastOwnerRes.json()) as any).code, "SELF_LOCKOUT_PREVENTED");

    // 4. Fetch global stats
    const statsRes = await fetch(`${baseUrl}/api/v1/super/stats`, {
      headers: {
        authorization: `Bearer ${token}`
      }
    });
    assert.equal(statsRes.status, 200);
    const statsData = (await statsRes.json()) as any;
    assert.equal(statsData.stats.totalTenants, 1);
    assert.equal(statsData.stats.totalUsers, 2);
  });
});
