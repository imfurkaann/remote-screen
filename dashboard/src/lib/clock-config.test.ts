import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_CLOCK_CONFIG,
  normalizeClockConfig
} from "../components/clock/ClockStudio.tsx";

describe("clock configuration", () => {
  it("provides a focused modern default", () => {
    assert.equal(DEFAULT_CLOCK_CONFIG.layout, "split");
    assert.equal(DEFAULT_CLOCK_CONFIG.theme, "midnight");
    assert.equal(DEFAULT_CLOCK_CONFIG.timezone, "Europe/Istanbul");
  });

  it("migrates legacy layouts and themes", () => {
    const migrated = normalizeClockConfig({
      layout: "hybrid",
      theme: "light",
      primaryColor: "#123456",
      locale: "en"
    });
    assert.equal(migrated.layout, "split");
    assert.equal(migrated.theme, "paper");
    assert.equal(migrated.primaryColor, "#123456");
    assert.equal(migrated.locale, "en");
  });

  it("falls back safely for removed styles and invalid colors", () => {
    const migrated = normalizeClockConfig({
      layout: "word",
      theme: "cyberpunk",
      primaryColor: "url(javascript:alert(1))"
    });
    assert.equal(migrated.layout, "split");
    assert.equal(migrated.theme, "midnight");
    assert.equal(migrated.primaryColor, "#6ee7b7");
  });
});
