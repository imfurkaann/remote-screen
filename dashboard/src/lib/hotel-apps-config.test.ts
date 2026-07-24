import assert from "node:assert/strict";
import test from "node:test";
import { normalizeEventsConfig } from "../components/events/EventsStudio";
import { normalizeHotelGuideConfig } from "../components/hotel-guide/HotelGuideStudio";

test("event settings constrain schedules and colors", () => {
  const config = normalizeEventsConfig({ accentColor: "url(x)", events: Array.from({ length: 15 }, (_, i) => ({ title: `Event ${i}`, start: "30:90" })) });
  assert.equal(config.events.length, 10);
  assert.equal(config.events[0]!.start, "09:00");
  assert.equal(config.accentColor, "#60a5fa");
});

test("hotel guide settings constrain services", () => {
  const config = normalizeHotelGuideConfig({ services: Array.from({ length: 12 }, (_, i) => ({ name: `Service ${i}`, icon: "invalid" })) });
  assert.equal(config.services.length, 8);
  assert.equal(config.services[0]!.icon, "other");
});
