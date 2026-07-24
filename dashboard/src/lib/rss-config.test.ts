import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_RSS_CONFIG, normalizeRssConfig } from "../components/rss/RssStudio";

test("RSS config supplies modern defaults", () => {
  assert.deepEqual(normalizeRssConfig({}), DEFAULT_RSS_CONFIG);
});

test("RSS config migrates legacy settings", () => {
  const normalized = normalizeRssConfig({
    layout: "cards",
    speed: "fast",
    theme: "light"
  });

  assert.equal(normalized.layout, "cards");
  assert.equal(normalized.speed, "fast");
  assert.equal(normalized.theme, "paper");
  assert.equal(normalized.maxItems, 10);
});

test("RSS config constrains user-controlled values", () => {
  const normalized = normalizeRssConfig({
    rssUrl: `https://example.com/${"x".repeat(2200)}`,
    sourceLabel: "x".repeat(80),
    layout: "unknown",
    speed: "instant",
    maxItems: 200
  });

  assert.equal(normalized.rssUrl.length, 2048);
  assert.equal(normalized.sourceLabel.length, 50);
  assert.equal(normalized.layout, "split");
  assert.equal(normalized.speed, "medium");
  assert.equal(normalized.maxItems, 10);
});
