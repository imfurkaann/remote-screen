import assert from "node:assert/strict";
import test from "node:test";
import { buildQrPayload, DEFAULT_QR_CONFIG, normalizeQrConfig, qrContrast } from "../components/qrcode/QrStudio";

test("QR config supplies modern defaults", () => {
  assert.deepEqual(normalizeQrConfig({}), DEFAULT_QR_CONFIG);
});

test("QR config restores safe contrast", () => {
  const normalized = normalizeQrConfig({ foregroundColor: "#ffffff", backgroundColor: "#eeeeee" });
  assert.ok(qrContrast(normalized.foregroundColor, normalized.backgroundColor) >= 4.5);
  assert.equal(normalized.foregroundColor, "#0f172a");
  assert.equal(normalized.backgroundColor, "#ffffff");
});

test("QR config builds escaped Wi-Fi payloads", () => {
  const config = normalizeQrConfig({
    contentType: "wifi",
    ssid: "Guest;Network",
    password: "safe,password",
    security: "WPA",
    hiddenNetwork: true
  });

  assert.equal(buildQrPayload(config), "WIFI:T:WPA;S:Guest\\;Network;P:safe\\,password;H:true;;");
});
