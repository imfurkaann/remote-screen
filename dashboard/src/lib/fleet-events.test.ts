import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { commandAckStatus, mergeDeviceStatus } from "./fleet-events.ts";

describe("fleet socket event reducers", () => {
  it("updates only the matching device", () => {
    const first = { id: "a", status: "offline", last_seen_at: null, last_heartbeat_at: null };
    const second = { id: "b", status: "offline", last_seen_at: null, last_heartbeat_at: null };
    const result = mergeDeviceStatus([first, second], {
      device_id: "b",
      hardware_id: "hw-b",
      status: "online",
      last_seen_at: "2026-07-21T12:00:00.000Z"
    });
    assert.equal(result[0], first);
    assert.equal(result[1]?.status, "online");
    assert.equal(result[1]?.last_heartbeat_at, "2026-07-21T12:00:00.000Z");
  });

  it("does not fabricate a heartbeat from an offline event", () => {
    const result = mergeDeviceStatus(
      [{
        id: "a",
        status: "online",
        last_seen_at: "2026-07-21T12:00:00.000Z",
        last_heartbeat_at: "2026-07-21T12:00:00.000Z"
      }],
      { device_id: "a", hardware_id: "hw-a", status: "offline", last_seen_at: "2026-07-21T12:01:00.000Z" }
    );
    assert.equal(result[0]?.status, "offline");
    assert.equal(result[0]?.last_heartbeat_at, "2026-07-21T12:00:00.000Z");
  });

  it("normalizes wire ACK statuses", () => {
    const base = { device_id: "a", command_id: "c" };
    assert.equal(commandAckStatus({ ...base, status: "ACK" }), "acknowledged");
    assert.equal(commandAckStatus({ ...base, status: "COMPLETED" }), "completed");
    assert.equal(commandAckStatus({ ...base, status: "FAILED" }), "failed");
  });
});