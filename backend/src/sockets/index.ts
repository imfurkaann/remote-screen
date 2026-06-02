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
    socket.on("HEARTBEAT", async () => {
      try {
        const query = deviceId.match(/^[0-9a-fA-F]{24}$/)
          ? { _id: deviceId }
          : { hardwareId: deviceId };

        await DeviceModel.updateOne(query, { $set: { lastSeenAt: new Date(), status: "online" } });
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
