import type { DevicePresence } from "./device-presence";

export type ScreenPowerState = "on" | "off" | "unknown";

/**
 * Screen power telemetry is only trustworthy while the device is actively
 * heartbeating. A stale last-known value must not be presented as live state.
 */
export function getScreenPowerState(
  presence: DevicePresence,
  screenOn: boolean | null | undefined
): ScreenPowerState {
  if (presence !== "online" || typeof screenOn !== "boolean") return "unknown";
  return screenOn ? "on" : "off";
}

