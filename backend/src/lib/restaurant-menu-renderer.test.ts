import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRestaurantMenuConfig, renderRestaurantMenuHtml } from "./restaurant-menu-renderer.js";

test("restaurant menu normalization bounds categories and items", () => {
  const config = normalizeRestaurantMenuConfig({
    categories: Array.from({ length: 12 }, (_, index) => ({ id: `c-${index}`, name: `Category ${index}` })),
    items: Array.from({ length: 40 }, (_, index) => ({ id: `i-${index}`, categoryId: "c-0", name: `Item ${index}`, price: "10" }))
  });
  assert.equal(config.categories.length, 6);
  assert.equal(config.items.length, 24);
});

test("restaurant menu renderer escapes content and supports portrait screens", () => {
  const html = renderRestaurantMenuHtml("<Menu>", {
    restaurantName: "<script>alert(1)</script>",
    categories: [{ id: "main", name: "Main & Grill" }],
    items: [{ id: "x", categoryId: "main", name: "<img src=x>", description: "Safe", price: "20", badge: "popular", available: true }]
  });
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /&lt;img src=x&gt;/);
  assert.match(html, /@media\(max-aspect-ratio:1\/1\)/);
  assert.match(html, /viewport-fit=cover/);
});

test("restaurant menu editor layout is versioned, bounded, and rendered for both orientations", () => {
  const config = normalizeRestaurantMenuConfig({
    editor: {
      version: 99,
      snapToGrid: false,
      textElements: [{ id: "promo", preset: "heading", text: "<Haftanın menüsü>" }],
      layouts: {
        landscape: {
          heading: { x: 999, y: -20, width: 35, height: 12, fontScale: 8, align: "center", zIndex: 200 },
          "text:promo": { x: 20, y: 25, width: 50, height: 10, fontScale: 2, align: "center", zIndex: 20 }
        },
        portrait: { heading: { x: 11, y: 14, width: 78, height: 10, fontScale: 1.2, align: "right", zIndex: 4 } }
      }
    }
  });
  assert.equal(config.editor.version, 2);
  assert.equal(config.editor.snapToGrid, false);
  assert.deepEqual(config.editor.layouts.landscape.heading, { x: 65, y: 0, width: 35, height: 12, fontScale: 2.4, align: "center", zIndex: 30 });
  const html = renderRestaurantMenuHtml("Canvas menu", config as unknown as Record<string, unknown>);
  assert.match(html, /--lx:65%;--ly:0%;--lw:35%/);
  assert.match(html, /--px:11%;--py:14%;--pw:78%/);
  assert.match(html, /custom-text-heading/);
  assert.match(html, /&lt;Haftanın menüsü&gt;/);
  assert.match(html, /container-type:size/);
});
