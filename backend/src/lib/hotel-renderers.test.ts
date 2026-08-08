import assert from "node:assert/strict";
import test from "node:test";
import { normalizeEventsConfig, normalizeHotelGuideConfig, renderEventsHtml, renderHotelGuideHtml } from "./hotel-renderers.js";

test("event board is bounded, responsive and self-contained", () => {
  const config = normalizeEventsConfig({ events: Array.from({ length: 20 }, (_, i) => ({ title: `Event ${i}`, start: "99:99" })) });
  assert.equal(config.events.length, 10);
  assert.equal(config.events[0]!.start, "09:00");
  const html = renderEventsHtml("Events", { hotelName: "<script>x</script>" });
  assert.doesNotMatch(html, /<script>x/);
  assert.match(html, /setInterval\(update,30000\)/);
  assert.match(html, /window\.__remoteScreenTick=update/);
  assert.doesNotMatch(html, /https?:\/\//);
});

test("hotel guide escapes content and limits services", () => {
  const config = normalizeHotelGuideConfig({ services: Array.from({ length: 12 }, (_, i) => ({ name: `Service ${i}` })) });
  assert.equal(config.services.length, 8);
  const html = renderHotelGuideHtml("Guide", { welcome: "<img src=x onerror=alert(1)>", accentColor: "url(x)" });
  assert.doesNotMatch(html, /<img src/);
  assert.doesNotMatch(html, /url\(x\)/);
  assert.doesNotMatch(html, /<script/);
  assert.match(html, /--accent:#d7b46a/);
});
