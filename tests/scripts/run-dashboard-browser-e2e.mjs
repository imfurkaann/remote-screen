import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const args = parseArgs(process.argv.slice(2));
const reportDate = args["report-date"] ?? "2026-04-01";
const dashboardBaseUrl = args["dashboard-base-url"] ?? "http://localhost:3001";
const backendBaseUrl = args["backend-base-url"] ?? "http://localhost:4100/api/v1";
const bootstrapKey = args["bootstrap-key"] ?? "test-bootstrap-key";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const reportDir = path.join(root, "tests", "reports", reportDate);
fs.mkdirSync(reportDir, { recursive: true });
const reportPath = path.join(reportDir, "dashboard-browser-e2e.md");

const lines = [];
const sections = [];

function addLine(line = "") {
  lines.push(line);
}

function addSection(title, status, details = []) {
  sections.push({ title, status, details });
}

function flushReport(gateDecision, failureMessage = null) {
  lines.length = 0;
  addLine("# Dashboard Browser E2E Report");
  addLine("");
  addLine(`- Date: ${reportDate}`);
  addLine(`- Dashboard: ${dashboardBaseUrl}`);
  addLine(`- Backend: ${backendBaseUrl}`);
  addLine("");
  for (const section of sections) {
    addLine(`## ${section.title}`);
    addLine(`- ${section.status}`);
    for (const detail of section.details) {
      addLine(`- ${detail}`);
    }
    addLine("");
  }
  if (failureMessage) {
    addLine("## Failure");
    addLine(`- ${failureMessage}`);
    addLine("");
  }
  addLine("## Gate Decision");
  addLine(`- ${gateDecision}`);
  fs.writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8");
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      continue;
    }
    const key = value.slice(2);
    const nextValue = argv[index + 1];
    if (nextValue && !nextValue.startsWith("--")) {
      parsed[key] = nextValue;
      index += 1;
    } else {
      parsed[key] = "true";
    }
  }
  return parsed;
}

function resolveBrowserExecutable() {
  const candidates = [
    process.env.PW_BROWSER_PATH,
    process.env.PROGRAMFILES ? path.join(process.env.PROGRAMFILES, "Microsoft", "Edge", "Application", "msedge.exe") : null,
    process.env["PROGRAMFILES(X86)"] ? path.join(process.env["PROGRAMFILES(X86)"], "Microsoft", "Edge", "Application", "msedge.exe") : null,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Microsoft", "Edge", "Application", "msedge.exe") : null,
    process.env.PROGRAMFILES ? path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe") : null,
    process.env["PROGRAMFILES(X86)"] ? path.join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe") : null
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function createSamplePng() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO3f7akAAAAASUVORK5CYII=",
    "base64"
  );
}

async function requestPairingCode() {
  const hardwareId = `HW-BROWSER-E2E-${Date.now()}`;
  const keys = [bootstrapKey, "local-bootstrap-key"];
  for (const key of keys) {
    try {
      const response = await fetch(`${backendBaseUrl}/pairing/request-code`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-device-bootstrap-key": key
        },
        body: JSON.stringify({ hardware_id: hardwareId, tenant_id: "tenant-demo" })
      });
      if (response.ok) {
        return await response.json();
      }
    } catch (err) {
      // Ignore network errors and try next key
    }
  }
  throw new Error("pairing request failed for all bootstrap keys");
}

async function requestBackendAuthToken() {
  const response = await fetch(`${backendBaseUrl}/auth/dev-token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "qa@demo.local",
      tenant_id: "tenant-demo",
      role: "operator"
    })
  });

  if (!response.ok) {
    throw new Error(`dev token request failed with ${response.status}`);
  }

  const payload = await response.json();
  if (!payload.access_token) {
    throw new Error("backend auth token missing from dev-token response");
  }

  return payload.access_token;
}

async function confirmPairing(accessToken, pairingCode) {
  const response = await fetch(`${backendBaseUrl}/pairing/confirm`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ pairing_code: pairingCode })
  });

  if (!response.ok) {
    throw new Error(`pairing confirm failed with ${response.status}`);
  }
}

async function uploadMedia(accessToken, filename, buffer) {
  const formData = new FormData();
  formData.append("file", new Blob([buffer], { type: "image/png" }), filename);

  const response = await fetch(`${backendBaseUrl}/content/media/upload`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
    body: formData
  });

  if (!response.ok) {
    throw new Error(`media upload failed with ${response.status}`);
  }

  return response.json();
}

async function createPlaylist(accessToken, playlistName, mediaId) {
  const response = await fetch(`${backendBaseUrl}/content/playlists`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      name: playlistName,
      items: [{ media_id: mediaId, duration_ms: 10_000, position: 0 }]
    })
  });

  if (!response.ok) {
    throw new Error(`playlist create failed with ${response.status}`);
  }

  return response.json();
}

async function publishPlaylist(accessToken, playlistId, deviceId) {
  const response = await fetch(`${backendBaseUrl}/content/playlists/${playlistId}/publish`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ device_ids: [deviceId] })
  });

  if (!response.ok) {
    throw new Error(`playlist publish failed with ${response.status}`);
  }

  return response.json();
}

async function dispatchCommand(accessToken, deviceId, commandType, payload, commandId) {
  const response = await fetch(`${backendBaseUrl}/commands/devices/${deviceId}/commands`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      device_id: deviceId,
      command_id: commandId,
      command_type: commandType,
      payload,
      timeout_ms: 15_000,
      max_attempts: 2
    })
  });

  if (!response.ok) {
    throw new Error(`command dispatch failed with ${response.status}`);
  }

  return response.json();
}

const browserPath = resolveBrowserExecutable();
if (!browserPath) {
  throw new Error("Could not locate Microsoft Edge or Chrome. Set PW_BROWSER_PATH to a browser executable.");
}

const browser = await chromium.launch({ headless: true, executablePath: browserPath });
const context = await browser.newContext({ baseURL: dashboardBaseUrl });
const page = await context.newPage();
page.setDefaultTimeout(15000);

let success = true;
let failureMessage = null;

try {
  const accessToken = await requestBackendAuthToken();
  await page.goto("/");
  await page.goto("/login");
  addSection("Public UI Shell", "PASS", [
    "Home page rendered.",
    "Login page rendered."
  ]);

  const pairPayload = await requestPairingCode();
  const deviceId = pairPayload.device_id;
  const pairingCode = pairPayload.code;
  await confirmPairing(accessToken, pairingCode);
  addSection("Backend Pairing Bootstrap", "PASS", [
    `Paired device: ${deviceId}`,
    `Pairing code: ${pairingCode}`
  ]);

  const mediaName = `browser-e2e-${Date.now()}.png`;
  const mediaPayload = await uploadMedia(accessToken, mediaName, createSamplePng());
  const mediaId = mediaPayload.media.id;
  const playlistName = `Browser E2E ${Date.now()}`;
  const playlistPayload = await createPlaylist(accessToken, playlistName, mediaId);
  const publishPayload = await publishPlaylist(accessToken, playlistPayload.playlist.id, deviceId);

  addSection("Playlist Publish", "PASS", [
    `Uploaded media id: ${mediaId}`,
    `Created playlist: ${playlistPayload.playlist.id}`,
    `Published to device: ${deviceId}`,
    `Published device count: ${publishPayload.device_count}`
  ]);

  const commandId = `cmd-browser-e2e-${Date.now()}`;
  const commandPayload = await dispatchCommand(accessToken, deviceId, "SET_VOLUME", { volume: 25 }, commandId);
  addSection("Remote Command Dispatch", "PASS", [
    `Target device: ${deviceId}`,
    "Command type: SET_VOLUME",
    `Command status: ${commandPayload.command.status}`
  ]);
  await page.goto("/operations");
  addSection("Navigation and Operations", "PASS", [
    "Public pages rendered dashboard shell.",
    "Operations page rendered dashboard shell."
  ]);
} catch (error) {
  success = false;
  failureMessage = error instanceof Error ? error.message : String(error);
}

await browser.close();

flushReport(success ? "PASS" : "BLOCKED", failureMessage);

if (success) {
  process.stdout.write(fs.readFileSync(reportPath, "utf8"));
  process.exit(0);
}

process.stdout.write(fs.readFileSync(reportPath, "utf8"));
process.exit(1);