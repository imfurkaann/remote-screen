import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_WAYFINDING_CONFIG,
  normalizeWayfindingConfig
} from "../components/wayfinding/WayfindingStudio";

test("wayfinding config supplies hotel-ready defaults", () => {
  assert.deepEqual(normalizeWayfindingConfig({}), DEFAULT_WAYFINDING_CONFIG);
});

test("wayfinding config limits destinations and rejects unsafe values", () => {
  const config = normalizeWayfindingConfig({
    accentColor: "url(javascript:alert(1))",
    destinations: Array.from({ length: 10 }, (_, index) => ({
      id: `destination ${index}`,
      name: `Destination ${index}`,
      direction: index === 0 ? "invalid" : "right"
    }))
  });

  assert.equal(config.destinations.length, 6);
  assert.equal(config.destinations[0]!.id, "destination-0");
  assert.equal(config.destinations[0]!.direction, "up");
  assert.equal(config.accentColor, "#f6c453");
});

test("wayfinding config keeps one usable fallback destination", () => {
  const config = normalizeWayfindingConfig({
    layout: "spotlight",
    destinations: [{ name: "   " }]
  });

  assert.equal(config.layout, "spotlight");
  assert.ok(config.destinations.length > 0);
});
