import assert from "node:assert/strict";
import test from "node:test";
import { normalizeWeatherConfig, renderWeatherHtml } from "./weather-renderer.js";

test("weather renderer migrates legacy configuration", () => {
  assert.equal(normalizeWeatherConfig({ theme: "glassmorphism" }).theme, "sky");
  assert.equal(normalizeWeatherConfig({ theme: "dark" }).theme, "midnight");
  assert.equal(normalizeWeatherConfig({ theme: "light" }).theme, "paper");
  assert.equal(normalizeWeatherConfig({ units: "imperial" }).units, "imperial");
});

test("weather renderer uses current Open-Meteo fields and resilient refresh", () => {
  const html = renderWeatherHtml("Weather", { city: "İstanbul", forecastDays: 3 });

  assert.match(html, /current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m/);
  assert.match(html, /daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max/);
  assert.match(html, /localStorage\.setItem/);
  assert.match(html, /AbortController/);
  assert.match(html, /window\.addEventListener\("online",refresh\)/);
  assert.doesNotMatch(html, /current_weather=true/);
});

test("weather renderer safely embeds hostile location input", () => {
  const html = renderWeatherHtml("Weather", { city: "</script><script>alert(1)</script>" });

  assert.doesNotMatch(html, /<\/script><script>alert/);
  assert.match(html, /\\u003c\/script\\u003e/);
  assert.match(html, /&lt;\/script&gt;/);
});
