import type { Server } from "socket.io";
import type { CommandType } from "../models/command.model.js";

let ioInstance: Server | null = null;

export function setSocketServer(io: Server): void {
  ioInstance = io;
}

export type SyncContentPayload = {
  playlist_id: string | null;
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
  command_type: CommandType;
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

export type DeviceStatusPayload = {
  device_id: string;
  hardware_id: string;
  status: "online" | "degraded" | "offline";
  last_seen_at: string;
};

export function buildCanonicalDeviceRooms(deviceIds: readonly string[]): string[] {
  return [...new Set(deviceIds.filter(Boolean).map((deviceId) => `device:${deviceId}`))];
}

export function emitSyncContent(deviceId: string, payload: SyncContentPayload): void {
  emitSyncContentToDevices([deviceId], payload);
}

/** Serializes the payload once and lets the adapter fan it out to all rooms. */
export function emitSyncContentToDevices(deviceIds: readonly string[], payload: SyncContentPayload): void {
  if (!ioInstance) return;
  const rooms = buildCanonicalDeviceRooms(deviceIds);
  if (rooms.length === 0) return;
  ioInstance.of("/device").to(rooms).emit("SYNC_CONTENT", payload);
}

export async function hasConnectedDevice(deviceId: string): Promise<boolean> {
  if (!ioInstance) return false;
  const sockets = await ioInstance.of("/device").in(`device:${deviceId}`).fetchSockets();
  return sockets.length > 0;
}
export function emitCommandDispatch(deviceId: string, payload: CommandDispatchPayload): void {
  if (!ioInstance) return;
  ioInstance.of("/device").to(`device:${deviceId}`).emit("COMMAND_DISPATCH", payload);
}

export function emitDashboardCommandAck(
  payload: CommandAckRelayPayload,
  target: { tenantId: string; pairedOwnerUserId: string | null }
): void {
  if (!ioInstance) return;
  const rooms = [`dashboard:tenant:${target.tenantId}:owner`];
  if (target.pairedOwnerUserId) rooms.push(`dashboard:user:${target.pairedOwnerUserId}`);
  ioInstance.of("/dashboard").to(rooms).emit("COMMAND_ACK", payload);
}

export function emitDashboardDeviceStatus(
  payload: DeviceStatusPayload,
  target: { tenantId: string; pairedOwnerUserId: string | null }
): void {
  if (!ioInstance) return;
  const rooms = [`dashboard:tenant:${target.tenantId}:owner`];
  if (target.pairedOwnerUserId) rooms.push(`dashboard:user:${target.pairedOwnerUserId}`);
  ioInstance.of("/dashboard").to(rooms).emit("DEVICE_STATUS", payload);
}

export function disconnectDeviceSockets(deviceId: string): void {
  if (!ioInstance) return;
  ioInstance.of("/device").in(`device:${deviceId}`).disconnectSockets(true);
}
export function disconnectTenantSockets(tenantId: string): void {
  if (!ioInstance) return;
  ioInstance.of("/device").in(`device:tenant:${tenantId}`).disconnectSockets(true);
  ioInstance.of("/dashboard").in(`dashboard:tenant:${tenantId}`).disconnectSockets(true);
}
export function disconnectUserSockets(userId: string): void {
  if (!ioInstance) return;
  // Adapter-aware: disconnects the user's sockets on every backend node.
  ioInstance.of("/dashboard").in(`dashboard:user:${userId}`).disconnectSockets(true);
}