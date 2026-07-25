import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getScreenPowerState } from "./screen-power.ts";

describe("screen power state", () => {
  it("shows the live Android display state for an online device", () => {
    assert.equal(getScreenPowerState("online", true), "on");
    assert.equal(getScreenPowerState("online", false), "off");
  });

  it("does not present missing or stale telemetry as live", () => {
    assert.equal(getScreenPowerState("online", null), "unknown");
    assert.equal(getScreenPowerState("degraded", true), "unknown");
    assert.equal(getScreenPowerState("offline", true), "unknown");
  });
});
