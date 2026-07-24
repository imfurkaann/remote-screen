import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_NOTICE_CONFIG, normalizeNoticeConfig } from "../components/notice/NoticeStudio";

test("notice config supplies modern defaults", () => {
  assert.deepEqual(normalizeNoticeConfig({}), DEFAULT_NOTICE_CONFIG);
});

test("notice config migrates legacy icons and colors", () => {
  const legacy = normalizeNoticeConfig({
    headline: "Legacy notice",
    icon: "checkmark",
    bgColor: "#123456",
    textColor: "#ffffff"
  });

  assert.equal(legacy.icon, "success");
  assert.equal(legacy.theme, "custom");
  assert.equal(legacy.bgColor, "#123456");
});

test("notice config bounds text and invalid colors", () => {
  const normalized = normalizeNoticeConfig({
    headline: "x".repeat(200),
    body: "y".repeat(900),
    accentColor: "red"
  });

  assert.equal(normalized.headline.length, 140);
  assert.equal(normalized.body.length, 800);
  assert.match(normalized.accentColor, /^#[0-9a-f]{6}$/i);
});
