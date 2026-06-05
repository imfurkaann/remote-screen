import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { emitDashboardCommandAck } from "./registry.js";
import { processDeviceAck, type DeviceAckPayload } from "../services/command.service.js";
import { DeviceModel } from "../models/device.model.js";
import { deviceRepository } from "../repositories/device.repository.js";

type SocketDeps = {
  corsOrigin: string;
};

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
                checksum_sha_256: playlistChecksum,
                items: playlist.items.map((item) => ({
                  media_id: item.mediaId,
                  filename: item.filename,
                  media_url: item.mediaUrl,
                  checksum_sha_256: item.checksumSha256,
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

    // Heartbeat: device sends PING every ~30s; we update lastSeenAt so the
    // Screens page always shows a fresh "Last Seen" timestamp.
    socket.on("HEARTBEAT", async (payload?: any) => {
      try {
        const query = deviceId.match(/^[0-9a-fA-F]{24}$/)
          ? { _id: deviceId }
          : { hardwareId: deviceId };

        const updateFields: Record<string, any> = {
          lastSeenAt: new Date(),
          status: "online"
        };

        if (payload && typeof payload === "object") {
          if (payload.ipAddress !== undefined) updateFields.ipAddress = payload.ipAddress;
          if (payload.playerVersion !== undefined) updateFields.playerVersion = payload.playerVersion;
          if (payload.osVersion !== undefined) updateFields.osVersion = payload.osVersion;
          if (payload.resolution !== undefined) updateFields.resolution = payload.resolution;
          if (payload.memoryTotal !== undefined) updateFields.memoryTotal = payload.memoryTotal;
          if (payload.memoryUsed !== undefined) updateFields.memoryUsed = payload.memoryUsed;
        }

        await DeviceModel.updateOne(query, { $set: updateFields });
      } catch {
        // Non-fatal: ignore heartbeat errors
      }
    });

    socket.on("disconnect", async () => {
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
