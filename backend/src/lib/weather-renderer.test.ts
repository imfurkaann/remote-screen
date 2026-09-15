import assert from "node:assert/strict";
import test from "node:test";
import { normalizeWeatherConfig, renderWeatherHtml } from "./weather-renderer.js";

test("weather renderer migrates legacy configuration", () => {
  assert.equal(normalizeWeatherConfig({ theme: "glassmorphism" }).theme, "paper");
  assert.equal(normalizeWeatherConfig({ theme: "dark" }).theme, "paper");
  assert.equal(normalizeWeatherConfig({ theme: "light" }).theme, "paper");
  assert.equal(normalizeWeatherConfig({ units: "imperial" }).units, "imperial");
});

test("weather preserves text and display settings but locks the design", () => {
  const config = normalizeWeatherConfig({ city:"London", heading:"HEAD OFFICE", caption:"Welcome", layout:"split", units:"imperial", theme:"sunset", forecastDays:3 });
  assert.equal(config.heading,"HEAD OFFICE");
  assert.equal(config.caption,"Welcome");
  assert.equal(config.layout,"split");
  assert.equal(config.theme,"paper");
  assert.equal(config.forecastDays,3);
  assert.equal(normalizeWeatherConfig({heading:"x".repeat(100)}).heading.length,80);
  assert.equal(normalizeWeatherConfig({caption:"x".repeat(200)}).caption.length,140);
  const html=renderWeatherHtml("Weather",{heading:"<b>Office</b>",caption:"Welcome & enjoy"});
  assert.match(html,/&lt;b&gt;Office&lt;\/b&gt;/);
  assert.match(html,/Welcome &amp; enjoy/);
});

test("weather renderer uses current Open-Meteo fields and resilient refresh", () => {
  const html = renderWeatherHtml("Weather", { city: "İstanbul", forecastDays: 3 });

  assert.match(html, /current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m/);
  assert.match(html, /daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max/);
  assert.match(html, /localStorage\.setItem/);
  assert.match(html, /AbortController/);
  assert.match(html, /window\.addEventListener\("online",refresh\)/);
  assert.match(html, /window\.__remoteScreenTick/);
  assert.match(html, /typeof AbortController==="function"/);
  assert.doesNotMatch(html, /current_weather=true/);
});

test("weather renderer safely embeds hostile location input", () => {
  const html = renderWeatherHtml("Weather", { city: "</script><script>alert(1)</script>" });

  assert.doesNotMatch(html, /<\/script><script>alert/);
  assert.match(html, /\\u003c\/script\\u003e/);
  assert.match(html, /&lt;\/script&gt;/);
});
