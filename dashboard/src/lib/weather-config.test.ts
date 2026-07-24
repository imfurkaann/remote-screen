import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_WEATHER_CONFIG, normalizeWeatherConfig } from "../components/weather/WeatherStudio";

test("weather config supplies production-safe defaults", () => {
  assert.deepEqual(normalizeWeatherConfig({}), DEFAULT_WEATHER_CONFIG);
});

test("weather config migrates legacy themes", () => {
  assert.equal(normalizeWeatherConfig({ theme: "glassmorphism" }).theme, "sky");
  assert.equal(normalizeWeatherConfig({ theme: "dark" }).theme, "midnight");
  assert.equal(normalizeWeatherConfig({ theme: "light" }).theme, "paper");
});

test("weather config constrains invalid and oversized values", () => {
  const normalized = normalizeWeatherConfig({
    city: `  ${"x".repeat(150)}  `,
    units: "kelvin",
    locale: "de",
    forecastDays: 12,
    layout: "unknown",
    showDetails: false
  });

  assert.equal(normalized.city.length, 120);
  assert.equal(normalized.units, "metric");
  assert.equal(normalized.locale, "tr");
  assert.equal(normalized.forecastDays, 5);
  assert.equal(normalized.layout, "overview");
  assert.equal(normalized.showDetails, false);
});
