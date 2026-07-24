import type { CommandAckEvent, DeviceStatusEvent } from "./use-fleet-socket";

export function mergeDeviceStatus<T extends {
  id: string;
  status: string;
  last_seen_at?: string | null;
  last_heartbeat_at?: string | null;
}>(
  devices: readonly T[],
  event: DeviceStatusEvent
): T[] {
  return devices.map((device) => device.id === event.device_id
    ? {
        ...device,
        status: event.status,
        last_seen_at: event.last_seen_at,
        ...(event.status === "online" ? { last_heartbeat_at: event.last_seen_at } : {})
      }
    : device
  );
}

export function commandAckStatus(event: CommandAckEvent): "acknowledged" | "completed" | "failed" {
  if (event.status === "ACK") return "acknowledged";
  return event.status === "COMPLETED" ? "completed" : "failed";
}