import assert from "node:assert/strict";
import test from "node:test";
import { encodeQrMatrix } from "./qr-code.js";
import { buildQrPayload, normalizeQrConfig, renderQrHtml } from "./qr-renderer.js";

test("QR encoder produces deterministic Model 2 matrices", () => {
  const first = encodeQrMatrix("HELLO WORLD");
  const second = encodeQrMatrix("HELLO WORLD");

  assert.equal(first.version, 1);
  assert.equal(first.size, 21);
  assert.deepEqual(first.rows, second.rows);
  assert.ok(first.rows.every((row) => row.length === first.size && /^[01]+$/.test(row)));
  assert.equal(first.rows[0]?.slice(0, 7), "1111111");
  assert.equal(first.rows[6]?.slice(0, 7), "1111111");
});

test("QR encoder selects larger versions for larger content", () => {
  const small = encodeQrMatrix("https://example.com");
  const large = encodeQrMatrix(`https://example.com/${"a".repeat(500)}`);
  assert.ok(large.version > small.version);
  assert.equal(large.size, large.version * 4 + 17);
});

test("QR renderer creates Wi-Fi codes without exposing passwords", () => {
  const config = normalizeQrConfig({
    contentType: "wifi",
    ssid: "Guest;WiFi",
    password: "supersecret",
    security: "WPA",
    hiddenNetwork: true
  });
  assert.equal(buildQrPayload(config), "WIFI:T:WPA;S:Guest\\;WiFi;P:supersecret;H:true;;");

  const html = renderQrHtml("QR", config);
  assert.match(html, /<canvas id="qr"/);
  assert.match(html, /image-rendering:pixelated/);
  assert.doesNotMatch(html, /cdnjs|new QRCode|supersecret/);
});

test("QR renderer escapes visible content and enforces contrast", () => {
  const html = renderQrHtml("QR", {
    title: "</h1><script>alert(1)</script>",
    foregroundColor: "#ffffff",
    backgroundColor: "#eeeeee"
  });

  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;\/h1&gt;/);
  assert.match(html, /"#0f172a"/);
  assert.match(html, /"#ffffff"/);
});
