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
  command_type: "REBOOT_APP" | "SCREENSHOT" | "SET_VOLUME" | "FORCE_REFRESH";
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

export function emitDashboardCommandAck(payload: CommandAckRelayPayload): void {
  if (!ioInstance) {
    return;
  }

  ioInstance.of("/dashboard").emit("COMMAND_ACK", payload);
}
