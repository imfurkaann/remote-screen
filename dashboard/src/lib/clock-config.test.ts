import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_CLOCK_CONFIG,
  normalizeClockConfig
} from "../components/clock/ClockStudio.tsx";

describe("clock configuration", () => {
  it("preserves editable text and time settings while locking the design", () => {
    const config = normalizeClockConfig({ heading:"HEAD OFFICE", caption:"Welcome", timezone:"Asia/Tokyo", format:"12h", layout:"analog", theme:"warm", primaryColor:"#ff0000" });
    assert.equal(config.heading, "HEAD OFFICE");
    assert.equal(config.caption, "Welcome");
    assert.equal(config.timezone, "Asia/Tokyo");
    assert.equal(config.format, "12h");
    assert.equal(config.layout, "analog");
    assert.equal(config.theme, "paper");
    assert.equal(config.primaryColor, "#9b8159");
    assert.equal(normalizeClockConfig({ timezone:"invalid/zone" }).timezone, "Europe/Istanbul");
  });
  it("provides a focused modern default", () => {
    assert.equal(DEFAULT_CLOCK_CONFIG.layout, "split");
    assert.equal(DEFAULT_CLOCK_CONFIG.theme, "paper");
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
    assert.equal(migrated.primaryColor, "#9b8159");
    assert.equal(migrated.locale, "en");
  });

  it("falls back safely for removed styles and invalid colors", () => {
    const migrated = normalizeClockConfig({
      layout: "word",
      theme: "cyberpunk",
      primaryColor: "url(javascript:alert(1))"
    });
    assert.equal(migrated.layout, "split");
    assert.equal(migrated.theme, "paper");
    assert.equal(migrated.primaryColor, "#9b8159");
  });
});
