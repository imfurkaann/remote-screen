import assert from "node:assert/strict";
import test from "node:test";
import { normalizeNoticeConfig, renderNoticeHtml } from "./notice-renderer.js";

test("notice renderer migrates legacy settings", () => {
  const normalized = normalizeNoticeConfig({ icon: "checkmark", bgColor: "#123456", textColor: "#ffffff" });
  assert.equal(normalized.icon, "success");
  assert.equal(normalized.theme, "custom");
  assert.equal(normalized.bgColor, "#123456");
});

test("notice renderer creates responsive layouts and escapes content", () => {
  const html = renderNoticeHtml("Notice", {
    layout: "banner",
    headline: "</h1><script>alert(1)</script>",
    body: "Safe & clear"
  });

  assert.match(html, /class="notice banner"/);
  assert.match(html, /@media \(orientation:portrait\)/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;\/h1&gt;/);
  assert.match(html, /Safe &amp; clear/);
});
