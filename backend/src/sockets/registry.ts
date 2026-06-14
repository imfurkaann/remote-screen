import type { Server } from "socket.io";

let ioInstance: Server | null = null;

export function setSocketServer(io: Server): void {
  ioInstance = io;
}

export type SyncContentPayload = {
  playlist_id: string;
  playlist_version: number;
  checksum_sha256: string;
  items: Array<{
    media_id: string;
    filename: string;
    media_url: string;
    checksum_sha256: string;
    mime_type: string;
    duration_ms: number;
    position: number;
  }>;
};

export type CommandDispatchPayload = {
  command_id: string;
  command_type: "REBOOT_APP" | "SCREENSHOT" | "SET_VOLUME" | "FORCE_REFRESH" | "SCREEN_ON" | "SCREEN_OFF" | "SET_ORIENTATION" | "SET_OPERATING_HOURS" | "SET_SCALE_MODE";
  payload: Record<string, unknown>;
  timeout_ms: number;
  attempt: number;
};

export type CommandAckRelayPayload = {
  device_id: string;
  command_id: string;
  status: string;
  screenshot_url?: string;
  error_message?: string;
};

export function emitSyncContent(deviceId: string, payload: SyncContentPayload): void {
  if (!ioInstance) {
    return;
  }

  ioInstance.of("/device").to(`device:${deviceId}`).emit("SYNC_CONTENT", payload);
}

export function emitCommandDispatch(deviceId: string, payload: CommandDispatchPayload): void {
  if (!ioInstance) {
    return;
  }

  ioInstance.of("/device").to(`device:${deviceId}`).emit("COMMAND_DISPATCH", payload);
}

export async function emitDashboardCommandAck(payload: CommandAckRelayPayload): Promise<void> {
  if (!ioInstance) {
    return;
  }

  try {
    const { DeviceModel } = await import("../models/device.model.js");
    const query = payload.device_id.match(/^[0-9a-fA-F]{24}$/)
      ? { _id: payload.device_id }
      : { hardwareId: payload.device_id };

    const device = await DeviceModel.findOne(query).lean();
    if (device) {
      const dashboard = ioInstance.of("/dashboard");
      // 1. Emit to device owner's room
      if (device.pairedOwnerUserId) {
        dashboard.to(`dashboard:user:${device.pairedOwnerUserId}`).emit("COMMAND_ACK", payload);
      }
      // 2. Emit to tenant owner's room
      dashboard.to(`dashboard:tenant:${device.tenantId}:owner`).emit("COMMAND_ACK", payload);
    }
  } catch (err) {
    console.error("[sockets] Failed to relay command ack securely", err);
  }
}

export function disconnectUserSockets(userId: string): void {
  if (!ioInstance) {
    return;
  }

  const sockets = ioInstance.of("/dashboard").sockets;
  for (const [id, socket] of sockets.entries()) {
    if (socket.data && socket.data.userId === userId) {
      socket.disconnect(true);
      console.log(`[sockets] Disconnected socket ${id} for deactivated user ${userId}`);
    }
  }
}
