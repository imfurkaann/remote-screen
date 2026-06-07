import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { emitDashboardCommandAck } from "./registry.js";
import { processDeviceAck, type DeviceAckPayload } from "../services/command.service.js";
import { DeviceModel } from "../models/device.model.js";
import { deviceRepository } from "../repositories/device.repository.js";

type SocketDeps = {
  corsOrigin: string;
};

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
  private async flush(): Promise<void> {
    if (this.buffer.size === 0) return;

    const entries = [...this.buffer.entries()];
    // Clear the buffer before awaiting so new heartbeats accumulate cleanly.
    this.buffer.clear();

    const writes = entries.map(([, entry]) =>
      DeviceModel.updateOne(entry.deviceQuery, { $set: entry.fields }).catch((err) => {
        console.error("[HeartbeatBuffer] updateOne failed", err);
      })
    );

    await Promise.allSettled(writes);
    console.debug(`[HeartbeatBuffer] flushed ${writes.length} device heartbeats`);
  }
}

const heartbeatBuffer = new HeartbeatBuffer();
heartbeatBuffer.start();

// ---------------------------------------------------------------------------

export function createSocketServer(httpServer: HttpServer, deps: SocketDeps): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: deps.corsOrigin === "*" ? true : deps.corsOrigin,
      credentials: true
    }
  });

  const deviceNs = io.of("/device");
  const dashboardNs = io.of("/dashboard");

  deviceNs.on("connection", async (socket) => {
    const deviceId = String(
      socket.handshake.auth?.device_id ?? socket.handshake.query?.device_id ?? ""
    ).trim();
    if (!deviceId) {
      socket.disconnect(true);
      return;
    }

    socket.join(`device:${deviceId}`);

    // Mark device as online when socket connects
    try {
      const query = deviceId.match(/^[0-9a-fA-F]{24}$/)
        ? { _id: deviceId }
        : { hardwareId: deviceId };

      const device = await DeviceModel.findOne(query);
      if (device) {
        device.status = "online";
        device.lastSeenAt = new Date();
        await device.save();

        try {
          await deviceRepository.updateStatusByHardware(device.tenantId, device.hardwareId, "online");
        } catch (shadowErr) {
          console.error("[sockets] postgres status sync failed on connect", shadowErr);
        }

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
            const { PlaylistModel } = await import("../models/playlist.model.js");
            const { createHash } = await import("node:crypto");

            const playlist = await PlaylistModel.findById(device.currentPlaylistId).lean();
            if (playlist) {
              const playlistChecksum = createHash("sha256")
                .update(
                  JSON.stringify(
                    playlist.items.map((item) => ({
                      mediaId: item.mediaId,
                      checksumSha256: item.checksumSha256,
                      position: item.position
                    }))
                  )
                )
                .digest("hex");

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

    socket.on("COMMAND_ACK", async (payload: DeviceAckPayload) => {
      try {
        await processDeviceAck(payload);
      } catch {
        // Ignore errors to avoid dropping active socket session.
      }

      emitDashboardCommandAck(payload);
    });

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
      const query = deviceId.match(/^[0-9a-fA-F]{24}$/)
        ? { _id: deviceId }
        : { hardwareId: deviceId };

      const fields: Record<string, unknown> = {
        lastSeenAt: new Date(),
        status: "online"
      };

      if (payload && typeof payload === "object") {
        if (payload.ipAddress !== undefined) fields.ipAddress = payload.ipAddress;
        if (payload.playerVersion !== undefined) fields.playerVersion = payload.playerVersion;
        if (payload.osVersion !== undefined) fields.osVersion = payload.osVersion;
        if (payload.resolution !== undefined) fields.resolution = payload.resolution;
        if (payload.memoryTotal !== undefined) fields.memoryTotal = payload.memoryTotal;
        if (payload.memoryUsed !== undefined) fields.memoryUsed = payload.memoryUsed;
      }

      heartbeatBuffer.upsert(deviceId, query as Record<string, string>, fields);
    });

    socket.on("disconnect", async () => {
      // Remove from heartbeat buffer immediately on disconnect.
      heartbeatBuffer.evict(deviceId);

      try {
        const query = deviceId.match(/^[0-9a-fA-F]{24}$/)
          ? { _id: deviceId }
          : { hardwareId: deviceId };

        const device = await DeviceModel.findOne(query);
        if (device) {
          device.status = "offline";
          await device.save();

          try {
            await deviceRepository.updateStatusByHardware(device.tenantId, device.hardwareId, "offline");
          } catch (shadowErr) {
            console.error("[sockets] postgres status sync failed on disconnect", shadowErr);
          }
        }
      } catch (err) {
        console.error("[sockets] failed to update device status to offline on disconnect", err);
      }
    });
  });

  dashboardNs.on("connection", (socket) => {
    socket.on("dispatch:sync", ({ device_id, payload }) => {
      deviceNs.to(`device:${device_id}`).emit("SYNC_CONTENT", payload);
    });

    socket.on("dispatch:command", ({ device_id, payload }) => {
      deviceNs.to(`device:${device_id}`).emit("COMMAND_DISPATCH", payload);
    });
  });

  return io;
}
