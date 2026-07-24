import assert from "node:assert/strict";
import { createServer, type Server as HttpServer } from "node:http";

import jwt from "jsonwebtoken";
import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { io as createClient, type Socket } from "socket.io-client";

import { DeviceModel } from "../../backend/src/models/device.model.js";
import { TenantModel } from "../../backend/src/models/tenant.model.js";
import { closeSocketServer, createSocketServer } from "../../backend/src/sockets/index.js";
import { emitSyncContentToDevices, setSocketServer } from "../../backend/src/sockets/registry.js";

const deviceCount = Math.min(Math.max(Number(process.env.FLEET_SCALE_DEVICES ?? 1_000), 100), 5_000);
const batchSize = 100;
const tenantId = "tenant-fleet-scale";
const ownerId = "fleet-scale-owner";
const jwtSecret = "fleet-scale-jwt-secret-at-least-32-bytes";
const jwtIssuer = "fleet-scale";
const jwtAudience = "fleet-scale-clients";

function listen(server: HttpServer): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not allocate scale-test port"));
        return;
      }
      resolve(address.port);
    });
  });
}

function connect(socket: Socket, timeoutMs = 30_000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Scale client connection timed out"));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off("connect", onConnect);
      socket.off("connect_error", onError);
    };
    const onConnect = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    socket.once("connect", onConnect);
    socket.once("connect_error", onError);
  });
}

async function waitUntil(predicate: () => Promise<boolean>, timeoutMs: number, label: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const clients: Socket[] = [];
  let mongo: MongoMemoryServer | null = null;
  let http: HttpServer | null = null;
  let io: Awaited<ReturnType<typeof createSocketServer>> | null = null;

  try {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri(), { maxPoolSize: 100, minPoolSize: 0, autoIndex: true });
    await TenantModel.create({ _id: tenantId, name: "Fleet Scale Tenant", nameKey: tenantId, isActive: true });

    const seedStartedAt = Date.now();
    const deviceSeeds = Array.from({ length: deviceCount }, (_, index) => ({
      _id: new Types.ObjectId(),
      tenantId,
      hardwareId: `HW-SCALE-${String(index + 1).padStart(5, "0")}`,
      pairedOwnerUserId: ownerId,
      status: "offline" as const,
      orientation: 0,
      operatingHours: "Always On",
      scaleMode: "fit"
    }));
    await DeviceModel.insertMany(deviceSeeds, { ordered: true });
    const seedMs = Date.now() - seedStartedAt;

    http = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"ok":true}');
    });
    io = await createSocketServer(http, {
      corsOrigin: "*",
      jwtSecret,
      jwtIssuer,
      jwtAudience,
      redisUrl: null,
      nodeEnv: "test"
    });
    setSocketServer(io);
    const port = await listen(http);
    const baseUrl = `http://127.0.0.1:${port}`;

    const connectStartedAt = Date.now();
    for (let offset = 0; offset < deviceSeeds.length; offset += batchSize) {
      const batch = deviceSeeds.slice(offset, offset + batchSize);
      await Promise.all(batch.map(async (device) => {
        const token = jwt.sign(
          {
            sub: String(device._id),
            tenant_id: tenantId,
            role: "device",
            hardware_id: device.hardwareId,
            owner_user_id: ownerId
          },
          jwtSecret,
          { issuer: jwtIssuer, audience: jwtAudience, expiresIn: "1h", notBefore: "0s" }
        );
        const client = createClient(`${baseUrl}/device`, {
          auth: { token },
          transports: ["websocket"],
          reconnection: false,
          forceNew: true,
          autoConnect: false
        });
        clients.push(client);
        const ready = connect(client);
        client.connect();
        await ready;
      }));
    }

    await waitUntil(
      async () => (await io!.of("/device").fetchSockets()).length === deviceCount,
      30_000,
      `${deviceCount} server-side socket registrations`
    );
    const connectMs = Date.now() - connectStartedAt;
    const serverSocketCount = (await io.of("/device").fetchSockets()).length;
    assert.equal(serverSocketCount, deviceCount);

    let received = 0;
    let resolveFanout!: () => void;
    const fanoutReceived = new Promise<void>((resolve) => {
      resolveFanout = resolve;
    });
    for (const client of clients) {
      client.once("SYNC_CONTENT", () => {
        received += 1;
        if (received === deviceCount) resolveFanout();
      });
    }

    const fanoutStartedAt = Date.now();
    emitSyncContentToDevices(
      deviceSeeds.map((device) => String(device._id)),
      {
        playlist_id: "fleet-scale-playlist",
        playlist_version: 1,
        checksum_sha256: "a".repeat(64),
        items: [{
          media_id: "fleet-scale-media",
          filename: "fleet-scale.png",
          media_url: "/uploads/fleet-scale.png",
          checksum_sha256: "b".repeat(64),
          mime_type: "image/png",
          duration_ms: 10_000,
          position: 0
        }]
      }
    );
    await Promise.race([
      fanoutReceived,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Fleet fan-out timed out")), 30_000))
    ]);
    const fanoutMs = Date.now() - fanoutStartedAt;
    assert.equal(received, deviceCount);

    const heartbeatStartedAt = Date.now();
    clients.forEach((client, index) => client.emit("HEARTBEAT", {
      playerVersion: "scale-1.0.0",
      osVersion: "Android Scale Simulation",
      resolution: "1920x1080",
      memoryUsed: String(256 + (index % 128))
    }));
    const heartbeatEmitMs = Date.now() - heartbeatStartedAt;
    await new Promise((resolve) => setTimeout(resolve, 250));

    const memory = process.memoryUsage();
    process.stdout.write(`FLEET_SCALE_RESULT ${JSON.stringify({
      status: "PASS",
      devices: deviceCount,
      batch_size: batchSize,
      seed_ms: seedMs,
      connect_ms: connectMs,
      connections_per_second: Number((deviceCount / (connectMs / 1_000)).toFixed(2)),
      fanout_ms: fanoutMs,
      fanout_deliveries_per_second: Number((deviceCount / Math.max(fanoutMs / 1_000, 0.001)).toFixed(2)),
      heartbeat_emit_ms: heartbeatEmitMs,
      server_socket_count: serverSocketCount,
      heap_used_mb: Number((memory.heapUsed / 1024 / 1024).toFixed(2)),
      rss_mb: Number((memory.rss / 1024 / 1024).toFixed(2)),
      elapsed_ms: Date.now() - startedAt
    })}\n`);
  } catch (error) {
    process.stderr.write(`FLEET_SCALE_RESULT ${JSON.stringify({
      status: "FAIL",
      devices: deviceCount,
      elapsed_ms: Date.now() - startedAt,
      error: error instanceof Error ? error.stack ?? error.message : String(error)
    })}\n`);
    process.exitCode = 1;
  } finally {
    clients.forEach((client) => client.disconnect());
    if (io) await closeSocketServer(io).catch(() => undefined);
    else if (http) await new Promise<void>((resolve) => http?.close(() => resolve())).catch(() => undefined);
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => undefined);
    if (mongo) await mongo.stop().catch(() => undefined);
  }
}

void main();
