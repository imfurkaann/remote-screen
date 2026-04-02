import { spawnSync } from "node:child_process";
import { after, afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import { CommandModel } from "../models/command.model.js";
import { DeviceModel } from "../models/device.model.js";
import { TelemetryModel } from "../models/telemetry.model.js";

let mongoServer: MongoMemoryServer | null = null;

before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

after(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = null;
  }
});

afterEach(async () => {
  await Promise.all([
    CommandModel.deleteMany({}),
    DeviceModel.deleteMany({}),
    TelemetryModel.deleteMany({})
  ]);
});

function runScript(extraEnv: Record<string, string>): number {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "src/scripts/check-governance-exceptions.ts"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "test",
        MONGO_URI: mongoServer?.getUri() ?? "mongodb://127.0.0.1:27017/unused",
        JWT_ACCESS_SECRET: "test-secret",
        JWT_ISSUER: "remote-screen",
        JWT_AUDIENCE: "remote-screen-clients",
        DEVICE_BOOTSTRAP_KEY: "bootstrap-secret",
        CHECK_TENANT_ID: "tenant-test",
        ...extraEnv
      },
      encoding: "utf8"
    }
  );

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
}

describe("governance exception CLI", () => {
  it("exits cleanly when governance is healthy", () => {
    const exitCode = runScript({ GOVERNANCE_POLICY_SCOPE: "all", GOVERNANCE_ISSUE_MODE: "dry_run" });

    assert.equal(exitCode, 0);
  });

  it("exits with a blocking code when critical signals are present", async () => {
    const now = new Date();
    const deviceOnlineId = new mongoose.Types.ObjectId().toHexString();
    const deviceOfflineId = new mongoose.Types.ObjectId().toHexString();

    await DeviceModel.insertMany([
      {
        _id: deviceOnlineId,
        tenantId: "tenant-test",
        hardwareId: "hw-online",
        status: "online",
        pairedOwnerUserId: "owner-1",
        currentPlaylistId: null,
        lastHeartbeatAt: now,
        lastSeenAt: now
      },
      {
        _id: deviceOfflineId,
        tenantId: "tenant-test",
        hardwareId: "hw-offline",
        status: "offline",
        pairedOwnerUserId: "owner-1",
        currentPlaylistId: null,
        lastHeartbeatAt: now,
        lastSeenAt: now
      }
    ]);

    await CommandModel.insertMany([
      {
        tenantId: "tenant-test",
        deviceId: deviceOnlineId,
        commandId: "cmd-1",
        commandType: "FORCE_REFRESH",
        payload: {},
        status: "failed",
        attempts: 1,
        maxAttempts: 2,
        timeoutMs: 15000
      },
      {
        tenantId: "tenant-test",
        deviceId: deviceOfflineId,
        commandId: "cmd-2",
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
        tenantId: "tenant-test",
        deviceId: deviceOfflineId,
        kind: "error",
        correlationId: "corr-1",
        payload: { message: "failure" },
        createdAt: now,
        updatedAt: now
      }
    ]);

    const exitCode = runScript({ GOVERNANCE_POLICY_SCOPE: "all", GOVERNANCE_ISSUE_MODE: "dry_run" });

    assert.equal(exitCode, 2);
  });
});