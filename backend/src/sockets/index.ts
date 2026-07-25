import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient, type RedisClientType } from "redis";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import { emitDashboardCommandAck, emitDashboardDeviceStatus } from "./registry.js";
import {
  dispatchPendingCommandsForDevice,
  processDeviceAck,
  type DeviceAckPayload
} from "../services/command.service.js";
import { DeviceModel } from "../models/device.model.js";
import { UserModel } from "../models/user.model.js";
import { PlaylistModel } from "../models/playlist.model.js";
import { playlistContentChecksum } from "../lib/playlist-policy.js";
import { isTenantActive } from "../lib/tenant-state.js";
import { deviceRepository } from "../repositories/device.repository.js";

type SocketDeps = {
  corsOrigin: string;
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  redisUrl: string | null;
  nodeEnv: string;
};

type SocketRuntime = {
  redisClients: [RedisClientType, RedisClientType] | null;
  heartbeatBuffer: HeartbeatBuffer;
  disconnectTimers: Map<string, ReturnType<typeof setTimeout>>;
  staleStatusTimer: ReturnType<typeof setInterval>;
};

const runtimeByServer = new WeakMap<Server, SocketRuntime>();

// ---------------------------------------------------------------------------
// HeartbeatBuffer — batches per-device telemetry and flushes to MongoDB in a
// single updateOne per device on a configurable interval.
//
// Problem being solved: 10 000 connected devices × heartbeat every 30 s
// = 333 synchronous MongoDB writes per second just for "I'm alive" pings.
// MongoDB handles this in practice, but it wastes I/O, index scans, and
// connection-pool slots that could be used for actual business operations.
//
// Solution: accumulate the latest telemetry snapshot per device in memory.
// A setInterval flushes all dirty entries in a Promise.allSettled batch.
// Each device contributes at most 1 write per FLUSH_INTERVAL_MS, regardless
// of how frequently heartbeats arrive.
//
// Memory cost: ~500 bytes per connected device. 10 000 devices ≈ 5 MB.
// ---------------------------------------------------------------------------

type HeartbeatEntry = {
  deviceQuery: Record<string, string>;
  fields: Record<string, unknown>;
  dirtyAt: number; // epoch ms of last update — used to skip stale entries
};

const HEARTBEAT_FLUSH_INTERVAL_MS = 15_000; // flush every 15 s (not every 30 s heartbeat)

class HeartbeatBuffer {
  private readonly buffer = new Map<string, HeartbeatEntry>();
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => {
      this.flush().catch((err) =>
        console.error("[HeartbeatBuffer] flush error", err)
      );
    }, HEARTBEAT_FLUSH_INTERVAL_MS);
    // Allow Node.js to exit even if the timer is active.
    if (this.flushTimer.unref) this.flushTimer.unref();
  }

  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /** Upsert the latest telemetry snapshot for a device. O(1). */
  upsert(deviceKey: string, query: Record<string, string>, fields: Record<string, unknown>): void {
    this.buffer.set(deviceKey, {
      deviceQuery: query,
      fields,
      dirtyAt: Date.now()
    });
  }

  /** Remove a device from the buffer (e.g. on disconnect). */
  evict(deviceKey: string): void {
    this.buffer.delete(deviceKey);
  }

  /** Drain the buffer and write all pending entries to MongoDB. */
  async flush(): Promise<void> {
    if (this.buffer.size === 0) return;

    const entries = [...this.buffer.entries()];
    // Clear the buffer before awaiting so new heartbeats accumulate cleanly.
    this.buffer.clear();

    const operations = entries.map(([, entry]) => ({
      updateOne: {
        filter: entry.deviceQuery,
        update: { $set: entry.fields },
        upsert: false
      }
    }));

    try {
      await DeviceModel.bulkWrite(operations, { ordered: false });
      console.debug("[HeartbeatBuffer] flushed " + operations.length + " device heartbeats");
    } catch (err) {
      console.error("[HeartbeatBuffer] bulkWrite failed", err);
      for (const [deviceKey, entry] of entries) {
        if (!this.buffer.has(deviceKey)) {
          this.buffer.set(deviceKey, entry);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------

export async function createSocketServer(httpServer: HttpServer, deps: SocketDeps): Promise<Server> {
  const heartbeatBuffer = new HeartbeatBuffer();
  const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const screenStateByDevice = new Map<string, boolean>();
  heartbeatBuffer.start();
  const staleStatusTimer = setInterval(() => {
    const now = Date.now();
    void DeviceModel.bulkWrite([
      {
        updateMany: {
          filter: {
            status: "online",
            lastHeartbeatAt: { $lt: new Date(now - 90_000) }
          },
          update: { $set: { status: "degraded" } }
        }
      },
      {
        updateMany: {
          filter: {
            status: { $ne: "offline" },
            lastHeartbeatAt: { $lt: new Date(now - 5 * 60_000) }
          },
          update: { $set: { status: "offline" } }
        }
      }
    ], { ordered: true }).catch((error) =>
      console.error("[sockets] stale device status sweep failed", error)
    );
  }, 60_000);
  staleStatusTimer.unref?.();

  const socketOrigins = deps.corsOrigin === "*"
    ? true
    : deps.corsOrigin.split(",").map((origin) => origin.trim()).filter(Boolean);
  const io = new Server(httpServer, {
    cors: {
      origin: socketOrigins,
      credentials: true
    },
    maxHttpBufferSize: 1_000_000,
    pingInterval: 25_000,
    pingTimeout: 20_000
  });

  if (deps.redisUrl) {
    const pubClient = createClient({ url: deps.redisUrl });
    const subClient = pubClient.duplicate();
    pubClient.on("error", (error) => console.error("[sockets] Redis pub client error", error));
    subClient.on("error", (error) => console.error("[sockets] Redis sub client error", error));
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    runtimeByServer.set(io, { redisClients: [pubClient, subClient], heartbeatBuffer, disconnectTimers, staleStatusTimer });
  } else if (deps.nodeEnv === "production") {
    throw new Error("REDIS_URL is required in production for distributed Socket.IO delivery");
  } else {
    console.warn("[sockets] REDIS_URL is not configured; running in single-node mode");
  }

  if (!runtimeByServer.has(io)) {
    runtimeByServer.set(io, { redisClients: null, heartbeatBuffer, disconnectTimers, staleStatusTimer });
  }

  const deviceNs = io.of("/device");
  const dashboardNs = io.of("/dashboard");

  // JWT Authentication middleware for dashboard namespace
  dashboardNs.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token ?? socket.handshake.query?.token;
      if (!token || typeof token !== "string") {
        return next(new Error("Authentication error: Token is required"));
      }

      const decoded = jwt.verify(token, deps.jwtSecret, {
        issuer: deps.jwtIssuer,
        audience: deps.jwtAudience
      }) as { sub: string; tenant_id: string; role: string; scope?: string };

      if (!decoded.sub || !decoded.tenant_id || !decoded.role || decoded.scope !== "dashboard_socket") {
        return next(new Error("Authentication error: Invalid claims"));
      }

      // Check if user is active (instant deactivation check)

      if (Types.ObjectId.isValid(decoded.sub)) {
        const [user, activeTenant] = await Promise.all([
          UserModel.findById(decoded.sub).select({ tenantId: 1, role: 1, isActive: 1 }).lean(),
          decoded.role === "super_admin"
            ? Promise.resolve(true)
            : isTenantActive(decoded.tenant_id)
        ]);
        if (!user || !user.isActive) {
          return next(new Error("Authentication error: Account deactivated or not found"));
        }
        if (!activeTenant) {
          return next(new Error("Authentication error: Organization is inactive"));
        }
        if (user.tenantId !== decoded.tenant_id || user.role !== decoded.role) {
          return next(new Error("Authentication error: Session claims are stale"));
        }
      } else if (deps.nodeEnv === "production") {
        return next(new Error("Authentication error: Invalid user identifier"));
      }

      // Attach auth payload to socket and socket.data for deactivation registry lookup
      const authData = {
        userId: decoded.sub,
        tenantId: decoded.tenant_id,
        role: decoded.role
      };
      (socket as any).auth = authData;
      socket.data = authData;

      next();
    } catch {
      next(new Error("Authentication error: Invalid token"));
    }
  });

  deviceNs.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token || typeof token !== "string") {
        return next(new Error("Authentication error: Device token is required"));
      }

      const decoded = jwt.verify(token, deps.jwtSecret, {
        issuer: deps.jwtIssuer,
        audience: deps.jwtAudience
      }) as { sub: string; tenant_id: string; role: string; hardware_id: string };

      if (decoded.role !== "device" || !decoded.sub || !decoded.tenant_id || !decoded.hardware_id) {
        return next(new Error("Authentication error: Invalid device claims"));
      }

      const [device, activeTenant] = await Promise.all([
        DeviceModel.findOne({
          _id: decoded.sub,
          tenantId: decoded.tenant_id,
          hardwareId: decoded.hardware_id,
          pairedOwnerUserId: { $ne: null }
        }).select({ _id: 1, tenantId: 1, hardwareId: 1, pairedOwnerUserId: 1 }).lean(),
        isTenantActive(decoded.tenant_id)
      ]);

      if (!device || !activeTenant) {
        return next(new Error("Authentication error: Device is not paired"));
      }

      socket.data = {
        deviceId: String(device._id),
        hardwareId: device.hardwareId,
        tenantId: String(device.tenantId),
        pairedOwnerUserId: device.pairedOwnerUserId ? String(device.pairedOwnerUserId) : null
      };
      next();
    } catch {
      next(new Error("Authentication error: Invalid device token"));
    }
  });

  deviceNs.on("connection", async (socket) => {
    const deviceId = String(socket.data.deviceId);
    const hardwareId = String(socket.data.hardwareId);
    const tenantId = String(socket.data.tenantId);
    const pairedOwnerUserId = socket.data.pairedOwnerUserId
      ? String(socket.data.pairedOwnerUserId)
      : null;

    const pendingDisconnect = disconnectTimers.get(deviceId);
    if (pendingDisconnect) {
      clearTimeout(pendingDisconnect);
      disconnectTimers.delete(deviceId);
    }

    // Join one canonical room only. Registry helpers may emit to both database and hardware IDs for compatibility;
    // joining both would deliver every command twice to authenticated clients.
    await socket.join([`device:${deviceId}`, `device:tenant:${tenantId}`]);

    // Mark device as online when socket connects
    try {
      const query = { _id: deviceId, tenantId, hardwareId };
      const device = await DeviceModel.findOne(query);
      if (device) {
        const connectedAt = new Date();
        if (typeof device.screenOn === "boolean") {
          screenStateByDevice.set(deviceId, device.screenOn);
        } else {
          screenStateByDevice.delete(deviceId);
        }
        device.status = "online";
        device.lastSeenAt = connectedAt;
        device.lastHeartbeatAt = connectedAt;
        await device.save();

        emitDashboardDeviceStatus(
          {
            device_id: deviceId,
            hardware_id: hardwareId,
            status: "online",
            last_seen_at: connectedAt.toISOString(),
            screen_on: typeof device.screenOn === "boolean" ? device.screenOn : null
          },
          { tenantId, pairedOwnerUserId }
        );

        void deviceRepository.updateStatusByHardware(tenantId, device.hardwareId, "online");
        await dispatchPendingCommandsForDevice(String(device._id), String(device.tenantId));

        // Push current orientation to device on connection
        if (device.orientation !== undefined && device.orientation !== null) {
          socket.emit("COMMAND_DISPATCH", {
            command_id: `init-orient-${Date.now()}`,
            command_type: "SET_ORIENTATION",
            payload: { orientation: device.orientation },
            timeout_ms: 10_000,
            attempt: 1
          });
        }

        // Push current operating hours to device on connection
        if (device.operatingHours !== undefined && device.operatingHours !== null) {
          socket.emit("COMMAND_DISPATCH", {
            command_id: `init-hours-${Date.now()}`,
            command_type: "SET_OPERATING_HOURS",
            payload: { operating_hours: device.operatingHours },
            timeout_ms: 10_000,
            attempt: 1
          });
        }

        // Push current scale mode to device on connection
        if (device.scaleMode !== undefined && device.scaleMode !== null) {
          socket.emit("COMMAND_DISPATCH", {
            command_id: `init-scale-${Date.now()}`,
            command_type: "SET_SCALE_MODE",
            payload: { scale_mode: device.scaleMode },
            timeout_ms: 10_000,
            attempt: 1
          });
        }

        // Push active playlist content to device on connection (for offline synchronization)
        if (device.currentPlaylistId) {
          try {
            const playlist = await PlaylistModel.findById(device.currentPlaylistId).lean();
            if (playlist) {
              const playlistChecksum =
                playlist.contentChecksumSha256 || playlistContentChecksum(playlist.items);

              const syncPayload = {
                playlist_id: String(playlist._id),
                playlist_version: playlist.version,
                checksum_sha256: playlistChecksum,
                items: playlist.items.map((item) => ({
                  media_id: item.mediaId,
                  filename: item.filename,
                  media_url: item.mediaUrl,
                  checksum_sha256: item.checksumSha256,
                  mime_type: item.mimeType,
                  duration_ms: item.durationMs,
                  position: item.position
                }))
              };

              socket.emit("SYNC_CONTENT", syncPayload);
              console.log(`[sockets] Sent SYNC_CONTENT to device ${deviceId} on connection`);
            }
          } catch (syncErr) {
            console.error("[sockets] Failed to push active playlist on connection", syncErr);
          }
        }
      }
    } catch (err) {
      console.error("[sockets] failed to update device status to online on connect", err);
    }

    socket.on(
      "COMMAND_ACK",
      async (
        payload: Partial<DeviceAckPayload>,
        respond?: (result: { accepted: boolean; code?: string }) => void
      ) => {
        const commandId = String(payload?.command_id ?? "").trim();
        const status = String(payload?.status ?? "").toUpperCase();
        if (!commandId || commandId.length > 128 || !["ACK", "COMPLETED", "FAILED"].includes(status)) {
          respond?.({ accepted: false, code: "INVALID_ACK" });
          return;
        }

        const authenticatedPayload: DeviceAckPayload = {
          device_id: deviceId,
          command_id: commandId,
          status: status as DeviceAckPayload["status"],
          ...(typeof payload.screenshot_url === "string"
            ? { screenshot_url: payload.screenshot_url.slice(0, 2_048) }
            : {}),
          ...(typeof payload.error_message === "string"
            ? { error_message: payload.error_message.slice(0, 2_048) }
            : {}),
          ...(payload.diagnostics && typeof payload.diagnostics === "object"
            ? { diagnostics: payload.diagnostics }
            : {})
        };

        try {
          const committed = await processDeviceAck(authenticatedPayload);
          if (!committed) {
            respond?.({ accepted: false, code: "COMMAND_NOT_FOUND" });
            return;
          }
          emitDashboardCommandAck(authenticatedPayload, { tenantId, pairedOwnerUserId });
          respond?.({ accepted: true });
        } catch (error) {
          console.error("[sockets] command ack processing failed", error);
          respond?.({ accepted: false, code: "ACK_PROCESSING_FAILED" });
        }
      }
    );

    // -----------------------------------------------------------------------
    // Heartbeat handler — uses HeartbeatBuffer to batch MongoDB writes.
    //
    // Before: every HEARTBEAT → 1 immediate MongoDB updateOne
    //         10 000 devices × 1/30s = 333 writes/s
    //
    // After:  every HEARTBEAT → O(1) in-memory map upsert
    //         HeartbeatBuffer flushes every 15 s → max 10 000/15 ≈ 667 writes/s
    //         BUT only dirty entries are written, and each device produces at
    //         most 1 write per flush cycle regardless of heartbeat frequency.
    // -----------------------------------------------------------------------
    socket.on("HEARTBEAT", (payload?: Record<string, unknown>) => {
      const query = { _id: deviceId, tenantId, hardwareId };
      const heartbeatAt = new Date();

      const fields: Record<string, unknown> = {
        lastSeenAt: heartbeatAt,
        lastHeartbeatAt: heartbeatAt,
        status: "online"
      };

      if (payload && typeof payload === "object") {
        const copyBoundedString = (sourceKey: string, targetKey: string, maxLength: number) => {
          const value = payload[sourceKey];
          if (typeof value === "string" && value.length > 0) {
            fields[targetKey] = value.slice(0, maxLength);
          }
        };
        copyBoundedString("ipAddress", "ipAddress", 64);
        copyBoundedString("playerVersion", "playerVersion", 64);
        copyBoundedString("osVersion", "osVersion", 128);
        copyBoundedString("resolution", "resolution", 32);
        copyBoundedString("memoryTotal", "memoryTotal", 32);
        copyBoundedString("memoryUsed", "memoryUsed", 32);

        const screenOn = payload.screenOn;
        if (typeof screenOn === "boolean") {
          fields.screenOn = screenOn;
          if (screenStateByDevice.get(deviceId) !== screenOn) {
            screenStateByDevice.set(deviceId, screenOn);
            emitDashboardDeviceStatus(
              {
                device_id: deviceId,
                hardware_id: hardwareId,
                status: "online",
                last_seen_at: heartbeatAt.toISOString(),
                screen_on: screenOn
              },
              { tenantId, pairedOwnerUserId }
            );
          }
        }
      }

      heartbeatBuffer.upsert(deviceId, query, fields);
    });

    socket.on("disconnect", () => {
      // Mobile and Wi-Fi handovers often reconnect within seconds. Delaying the
      // offline transition prevents dashboard flicker and unnecessary DB writes.
      if (disconnectTimers.has(deviceId)) return;
      const disconnectedAt = new Date();
      const timer = setTimeout(async () => {
        disconnectTimers.delete(deviceId);
        try {
          const remainingSockets = await deviceNs.in(`device:${deviceId}`).fetchSockets();
          if (remainingSockets.length > 0) return;

          heartbeatBuffer.evict(deviceId);
          screenStateByDevice.delete(deviceId);
          const updated = await DeviceModel.findOneAndUpdate(
            { _id: deviceId, tenantId, hardwareId, lastHeartbeatAt: { $lte: disconnectedAt } },
            { $set: { status: "offline" } },
            { new: true }
          ).select({ _id: 1 });
          if (!updated) return;

          emitDashboardDeviceStatus(
            {
              device_id: deviceId,
              hardware_id: hardwareId,
              status: "offline",
              last_seen_at: disconnectedAt.toISOString()
            },
            { tenantId, pairedOwnerUserId }
          );
          void deviceRepository.updateStatusByHardware(tenantId, hardwareId, "offline");
        } catch (err) {
          console.error("[sockets] delayed offline transition failed", err);
        }
      }, 45_000);
      timer.unref?.();
      disconnectTimers.set(deviceId, timer);
    });
  });

  dashboardNs.on("connection", (socket) => {
    const auth = (socket as any).auth as { userId: string; tenantId: string; role: string };

    // Join operator's own private user room to receive isolated command ACKs
    socket.join([`dashboard:user:${auth.userId}`, `dashboard:tenant:${auth.tenantId}`]);

    // If role is tenant_owner, join tenant owner room to receive broadcast signals
    if (auth.role === "tenant_owner") {
      socket.join(`dashboard:tenant:${auth.tenantId}:owner`);
    }


  });

  return io;
}

export async function closeSocketServer(io: Server): Promise<void> {
  const runtime = runtimeByServer.get(io);
  runtime?.heartbeatBuffer.stop();
  if (runtime) clearInterval(runtime.staleStatusTimer);

  // Close sockets first so no heartbeat or disconnect timer can be added after
  // the final drain begins.
  await new Promise<void>((resolve) => io.close(() => resolve()));
  if (runtime) {
    for (const timer of runtime.disconnectTimers.values()) clearTimeout(timer);
    runtime.disconnectTimers.clear();
    await runtime.heartbeatBuffer.flush().catch((error) =>
      console.error("[sockets] final heartbeat flush failed", error)
    );
  }

  if (runtime?.redisClients) {
    await Promise.allSettled(runtime.redisClients.map((client) => client.quit()));
  }
  runtimeByServer.delete(io);
}
