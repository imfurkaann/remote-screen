import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEVICE_OFFLINE_WINDOW_MS,
  DEVICE_ONLINE_WINDOW_MS,
  getDevicePresence
} from "./device-presence.ts";

const NOW = Date.parse("2026-07-24T12:00:00.000Z");
const ago = (milliseconds: number) => new Date(NOW - milliseconds).toISOString();

describe("device presence", () => {
  it("never reports online without an authenticated heartbeat", () => {
    assert.equal(getDevicePresence({ status: "online", lastHeartbeatAt: null }, NOW), "offline");
    assert.equal(getDevicePresence({ status: "online", lastHeartbeatAt: "invalid" }, NOW), "offline");
  });

  it("keeps an explicit offline state authoritative", () => {
    assert.equal(getDevicePresence({ status: "offline", lastHeartbeatAt: ago(1_000) }, NOW), "offline");
  });

  it("reports a recent online heartbeat as online", () => {
    assert.equal(getDevicePresence({ status: "online", lastHeartbeatAt: ago(10_000) }, NOW), "online");
  });

  it("degrades stale or explicitly degraded connections", () => {
    assert.equal(getDevicePresence({ status: "online", lastHeartbeatAt: ago(DEVICE_ONLINE_WINDOW_MS) }, NOW), "degraded");
    assert.equal(getDevicePresence({ status: "degraded", lastHeartbeatAt: ago(10_000) }, NOW), "degraded");
  });

  it("reports expired heartbeats as offline", () => {
    assert.equal(getDevicePresence({ status: "online", lastHeartbeatAt: ago(DEVICE_OFFLINE_WINDOW_MS) }, NOW), "offline");
  });
});