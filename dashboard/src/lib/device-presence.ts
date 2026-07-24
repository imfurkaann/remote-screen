export type DevicePresence = "online" | "degraded" | "offline";

export const DEVICE_ONLINE_WINDOW_MS = 90_000;
export const DEVICE_OFFLINE_WINDOW_MS = 5 * 60_000;

type DevicePresenceInput = {
  status?: string | null | undefined;
  lastHeartbeatAt?: string | null | undefined;
};

/**
 * Calculates presence from the last authenticated device heartbeat.
 *
 * The persisted status is still authoritative for an explicit offline state,
 * but it cannot make a device online without a recent heartbeat. This prevents
 * pairing, content updates, or stale database values from creating false
 * "online" badges.
 */
export function getDevicePresence(
  input: DevicePresenceInput,
  nowMs = Date.now()
): DevicePresence {
  const storedStatus = String(input.status ?? "").toLowerCase();
  if (storedStatus === "offline") return "offline";

  if (!input.lastHeartbeatAt) return "offline";
  const heartbeatMs = Date.parse(input.lastHeartbeatAt);
  if (!Number.isFinite(heartbeatMs)) return "offline";

  const ageMs = Math.max(0, nowMs - heartbeatMs);
  if (ageMs >= DEVICE_OFFLINE_WINDOW_MS) return "offline";
  if (storedStatus === "degraded" || ageMs >= DEVICE_ONLINE_WINDOW_MS) return "degraded";
  return "online";
}