import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { emitDashboardCommandAck } from "./registry.js";
import { processDeviceAck, type DeviceAckPayload } from "../services/command.service.js";

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

  deviceNs.on("connection", (socket) => {
    const deviceId = String(
      socket.handshake.auth?.device_id ?? socket.handshake.query?.device_id ?? ""
    ).trim();
    if (!deviceId) {
      socket.disconnect(true);
      return;
    }

    socket.join(`device:${deviceId}`);

    socket.on("COMMAND_ACK", async (payload: DeviceAckPayload) => {
      try {
        await processDeviceAck(payload);
      } catch {
        // Ignore errors to avoid dropping active socket session.
      }

      emitDashboardCommandAck(payload);
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
