import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildCanonicalDeviceRooms } from "./registry.js";

describe("socket fleet room fan-out", () => {
  it("deduplicates canonical database-id rooms", () => {
    assert.deepEqual(
      buildCanonicalDeviceRooms(["device-a", "device-b", "device-a", ""]),
      ["device:device-a", "device:device-b"]
    );
  });

  it("keeps one room per target for large fleet publications", () => {
    const targets = Array.from({ length: 10_000 }, (_, index) => `id-${index}`);
    const rooms = buildCanonicalDeviceRooms([...targets, ...targets]);
    assert.equal(rooms.length, 10_000);
    assert.equal(rooms[9_999], "device:id-9999");
  });
});