import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRssConfig, parseRssXml, renderRssHtml } from "./rss-renderer.js";

test("RSS parser supports RSS, sanitizes markup, and decodes entities", () => {
  const feed = parseRssXml(`<?xml version="1.0"?>
    <rss><channel><title>Company &amp; News</title>
      <item><title><![CDATA[First <b>story</b>]]></title><description><![CDATA[Safe <script>alert(1)</script> summary &amp; more]]></description><link>https://example.com/one</link><pubDate>Thu, 24 Jul 2026 12:00:00 GMT</pubDate></item>
    </channel></rss>`);

  assert.equal(feed.feedTitle, "Company & News");
  assert.equal(feed.items[0]?.title, "First story");
  assert.equal(feed.items[0]?.description, "Safe summary & more");
  assert.equal(feed.items[0]?.link, "https://example.com/one");
  assert.match(feed.items[0]?.publishedAt ?? "", /^2026-07-24T12:00:00/);
});

test("RSS parser supports Atom entries and HTTPS-only links", () => {
  const feed = parseRssXml(`<feed><title>Atom Feed</title>
    <entry><title>Atom Story</title><summary>Short summary</summary><link href="http://example.com/unsafe"/><updated>2026-07-24T10:00:00Z</updated></entry>
  </feed>`);

  assert.equal(feed.items[0]?.title, "Atom Story");
  assert.equal(feed.items[0]?.description, "Short summary");
  assert.equal(feed.items[0]?.link, "");
});

test("RSS renderer is resilient and never injects feed data as HTML", () => {
  const html = renderRssHtml("RSS", {
    rssUrl: "https://example.com/feed.xml",
    layout: "split",
    theme: "ocean"
  });

  assert.match(html, /localStorage\.setItem/);
  assert.match(html, /AbortController/);
  assert.match(html, /textContent/);
  assert.match(html, /window\.addEventListener\("online",refresh\)/);
  assert.match(html, /window\.__remoteScreenTick/);
  assert.match(html, /typeof AbortController==="function"/);
  assert.doesNotMatch(html, /innerHTML/);
});

test("RSS config safely migrates old instances", () => {
  const normalized = normalizeRssConfig({ layout: "ticker", speed: "slow", theme: "light" });
  assert.equal(normalized.layout, "ticker");
  assert.equal(normalized.speed, "slow");
  assert.equal(normalized.theme, "paper");
});
