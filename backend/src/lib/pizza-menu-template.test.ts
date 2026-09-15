import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createPizzaMenuTemplate, createSnackMenuTemplate } from "./pizza-menu-template.js";
import { normalizeRestaurantMenuConfig, renderRestaurantMenuHtml } from "./restaurant-menu-renderer.js";

test("pizza defaults survive normalization including empty legacy fields and removable decorations", () => {
  const template = createPizzaMenuTemplate();
  const saved = normalizeRestaurantMenuConfig(JSON.parse(JSON.stringify(template)));
  assert.equal(saved.heading, "");
  assert.equal(saved.restaurantName, "");
  assert.equal(saved.items.length, 0);
  assert.equal(saved.categories.length, 0);
  assert.equal(saved.editor.textElements.length, 28);
  assert.equal(saved.editor.imageElements.length, 4);
  assert.equal(saved.editor.layouts.portrait["text:title"]?.fontFamily, "serif");
  saved.editor.imageElements = [];
  saved.editor.textElements = [];
  const reopened = normalizeRestaurantMenuConfig(JSON.parse(JSON.stringify(saved)));
  assert.equal(reopened.editor.imageElements.length, 0);
  assert.equal(reopened.editor.textElements.length, 0);
  assert.doesNotMatch(renderRestaurantMenuHtml("Menu", reopened), /Table &amp; Flame|Today&#39;s Menu|Margherita/);
});

test("template renderer includes all products and safe built-in images", () => {
  const html = renderRestaurantMenuHtml("Pizza", createPizzaMenuTemplate());
  for (const text of ["PIZZA MENU", "Vegetariana", "Homemade Iced Tea", "1100 kcal"]) assert.ok(html.includes(text));
  assert.ok(html.includes("data:image/svg+xml;charset=utf-8,"));
  const config = createPizzaMenuTemplate();
  config.editor.imageElements.push({ id: "bad", name: "bad", source: "javascript:alert(1)" });
  assert.equal(normalizeRestaurantMenuConfig(config).editor.imageElements.length, 4);
});

test("backend and dashboard ship the same portable template", () => {
  assert.equal(readFileSync(new URL("./pizza-menu-template.ts", import.meta.url), "utf8"), readFileSync(new URL("../../../dashboard/src/lib/pizza-menu-template.ts", import.meta.url), "utf8"));
});

test("snack menu retains editable rows, full-width checkerboards and typography", () => {
  const config = normalizeRestaurantMenuConfig(createSnackMenuTemplate());
  assert.equal(config.theme, "snack");
  assert.equal(config.editor.textElements.length, 14);
  assert.equal(config.editor.imageElements.length, 14);
  assert.equal(config.editor.layouts.portrait["image:snack-top"]?.width, 100);
  assert.equal(config.editor.layouts.portrait["text:snack-title"]?.fontStyle, "italic");
  const html = renderRestaurantMenuHtml("Snack Menu", config);
  for (const text of ["Mini Pizza", "Donut", "Cookies", "Pretzel", "Brownies", "Nachos"]) assert.ok(html.includes(text));
});
