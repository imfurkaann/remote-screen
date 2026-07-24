import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizeWayfindingConfig,
  renderWayfindingHtml
} from "./wayfinding-renderer.js";

describe("wayfinding renderer", () => {
  it("renders a responsive offline directory", () => {
    const html = renderWayfindingHtml("Lobby Guide", {
      hotelName: "Grand Hotel",
      currentLocation: "Main Lobby",
      locale: "en",
      layout: "directory",
      destinations: [
        { id: "spa", name: "Spa", floor: "-1", distance: "4 min", direction: "down-left" }
      ]
    });

    assert.match(html, /HOTEL DIRECTORY/);
    assert.match(html, /YOU ARE HERE/);
    assert.match(html, /class="directory single-column"/);
    assert.match(html, /@media \(max-aspect-ratio:1\/1\)/);
    assert.doesNotMatch(html, /https?:\/\//);
    assert.doesNotMatch(html, /<script/);
  });

  it("escapes guest-facing text and sanitizes colors", () => {
    const html = renderWayfindingHtml("Safe Guide", {
      hotelName: "</style><script>alert(1)</script>",
      accentColor: "url(javascript:alert(1))",
      destinations: [{ name: "<img src=x onerror=alert(1)>", direction: "right" }]
    });

    assert.doesNotMatch(html, /<script>alert/);
    assert.doesNotMatch(html, /<img src/);
    assert.doesNotMatch(html, /url\(javascript/);
    assert.match(html, /--accent:#f6c453/);
  });

  it("caps oversized destination collections", () => {
    const config = normalizeWayfindingConfig({
      destinations: Array.from({ length: 20 }, (_, index) => ({
        name: `Destination ${index}`,
        direction: "right"
      }))
    });

    assert.equal(config.destinations.length, 6);
  });
});
