import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizeClockConfig,
  renderClockHtml
} from "../routes/apps.route.js";

describe("clock renderer", () => {
  it("safely renders personalized text with a locked light theme", () => {
    const html = renderClockHtml("Office", { heading:"<b>Office</b>", caption:"Welcome & enjoy", theme:"warm", primaryColor:"#ff0000", layout:"split" });
    assert.match(html, /&lt;b&gt;Office&lt;\/b&gt;/);
    assert.match(html, /Welcome &amp; enjoy/);
    assert.match(html, /class="theme-paper" data-clock-layout="split"/);
    assert.doesNotMatch(html, /#ff0000/);
  });
  it("migrates legacy clock settings to the modern layouts", () => {
    const config = normalizeClockConfig({ layout: "hybrid", theme: "light" });
    assert.equal(config.layout, "split");
    assert.equal(config.theme, "paper");
  });

  it("renders a self-contained, responsive clock document", () => {
    const html = renderClockHtml("Lobby Clock", {
      layout: "analog",
      theme: "aurora",
      timezone: "Europe/Istanbul",
      showSeconds: false
    });
    assert.match(html, /data-layout="analog"/);
    assert.match(html, /class="analog"/);
    assert.match(html, /@media \(max-aspect-ratio:1\/1\)/);
    assert.match(html, /window\.__remoteScreenTick = update/);
    assert.doesNotMatch(html, /\?\.|\.\.\.options|\.padStart\(/);
    assert.doesNotMatch(html, /https?:\/\//);
  });

  it("sanitizes colors and script-like configuration text", () => {
    const html = renderClockHtml("Safe Clock", {
      primaryColor: "url(javascript:alert(1))",
      timezone: "</script><script>alert(1)</script>"
    });
    assert.doesNotMatch(html, /url\(javascript/);
    assert.doesNotMatch(html, /<\/script><script>alert/);
    assert.match(html, /--accent: #9b8159/);
  });
});
