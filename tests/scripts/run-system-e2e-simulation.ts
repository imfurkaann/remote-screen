import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server as HttpServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { MongoMemoryServer } from "mongodb-memory-server";
import { io as createClient, type Socket } from "socket.io-client";
import { chromium, type Browser } from "@playwright/test";

import { buildApp } from "../../backend/src/app.js";
import type { Env } from "../../backend/src/config/env.js";
import { TenantModel } from "../../backend/src/models/tenant.model.js";
import { UserModel } from "../../backend/src/models/user.model.js";
import { hashPassword } from "../../backend/src/lib/bcrypt.js";
import { DeviceModel } from "../../backend/src/models/device.model.js";
import { closeSocketServer, createSocketServer } from "../../backend/src/sockets/index.js";
import { setSocketServer } from "../../backend/src/sockets/registry.js";

type JsonRecord = Record<string, any>;
type CheckResult = { name: string; elapsed_ms: number };

const checks: CheckResult[] = [];
const tenantId = "tenant-system-e2e";
const hardwareId = "HW-SYSTEM-E2E-001";
const deviceProof = "system-e2e-device-proof-0123456789abcdef";
const bootstrapKey = "system-e2e-bootstrap-key";

function timedCheck(name: string, startedAt: number): void {
  checks.push({ name, elapsed_ms: Date.now() - startedAt });
  process.stdout.write(`PASS ${name}\n`);
}

async function runCheck(name: string, action: () => Promise<void>): Promise<void> {
  const startedAt = Date.now();
  await action();
  timedCheck(name, startedAt);
}

async function requestJson(
  url: string,
  options: RequestInit = {},
  expectedStatuses: number[] = [200]
): Promise<{ status: number; body: JsonRecord; response: Response }> {
  const response = await fetch(url, options);
  const text = await response.text();
  let body: JsonRecord = {};
  if (text) {
    try {
      body = JSON.parse(text) as JsonRecord;
    } catch {
      throw new Error(`${options.method ?? "GET"} ${url} returned non-JSON: ${text.slice(0, 300)}`);
    }
  }
  assert.ok(
    expectedStatuses.includes(response.status),
    `${options.method ?? "GET"} ${url}: expected ${expectedStatuses.join("/")}, got ${response.status}: ${text}`
  );
  return { status: response.status, body, response };
}

function jsonRequest(method: string, token: string | null, body: unknown): RequestInit {
  return {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  };
}

function waitForEvent<T>(
  socket: Socket,
  event: string,
  predicate: (payload: T) => boolean = () => true,
  timeoutMs = 8_000
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    const listener = (payload: T) => {
      if (!predicate(payload)) return;
      clearTimeout(timeout);
      socket.off(event, listener);
      resolve(payload);
    };
    socket.on(event, listener);
  });
}

function connectSocket(socket: Socket, timeoutMs = 8_000): Promise<void> {
  if (socket.connected) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Socket connection timed out"));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off("connect", onConnect);
      socket.off("connect_error", onError);
    };
    const onConnect = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    socket.once("connect", onConnect);
    socket.once("connect_error", onError);
    socket.connect();
  });
}

async function emitWithAck<T>(socket: Socket, event: string, payload: unknown): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${event} acknowledgement`)), 8_000);
    socket.emit(event, payload, (result: T) => {
      clearTimeout(timeout);
      resolve(result);
    });
  });
}

async function listen(server: HttpServer): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not allocate backend test port");
  return address.port;
}

async function allocatePort(): Promise<number> {
  const reservation = createServer();
  const port = await listen(reservation);
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  return port;
}

async function waitForHttp(url: string, child: ChildProcess, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Dashboard exited before readiness (code ${child.exitCode})`);
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // Startup race; retry until the deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Dashboard did not become ready within ${timeoutMs} ms`);
}

function resolveBrowserExecutable(): string {
  const candidates = [
    process.env.PW_BROWSER_PATH,
    process.env.PROGRAMFILES ? path.join(process.env.PROGRAMFILES, "Microsoft", "Edge", "Application", "msedge.exe") : null,
    process.env["PROGRAMFILES(X86)"] ? path.join(process.env["PROGRAMFILES(X86)"], "Microsoft", "Edge", "Application", "msedge.exe") : null,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Microsoft", "Edge", "Application", "msedge.exe") : null,
    process.env.PROGRAMFILES ? path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe") : null,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ];
  const executable = candidates.find((candidate): candidate is string => Boolean(candidate && existsSync(candidate)));
  if (!executable) throw new Error("Microsoft Edge or Google Chrome is required for dashboard E2E");
  return executable;
}

let mongoServer: MongoMemoryServer | null = null;
let httpServer: HttpServer | null = null;
let socketServer: Awaited<ReturnType<typeof createSocketServer>> | null = null;
let dashboardSocket: Socket | null = null;
let deviceSocket: Socket | null = null;
let dashboardProcess: ChildProcess | null = null;
let browser: Browser | null = null;
let mediaRoot = "";

async function main(): Promise<void> {
const startedAt = Date.now();
let baseUrl = "";
let apiUrl = "";
let userToken = "";
let deviceToken = "";
let deviceId = "";
let playlistId = "";
let playlistChecksum = "";
let mediaId = "";
let dashboardAckDeviceId = "";

try {
  process.env.NODE_ENV = "test";
  mediaRoot = await mkdtemp(path.join(tmpdir(), "remote-screen-system-e2e-"));
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri(), { maxPoolSize: 20, minPoolSize: 0, autoIndex: true });

  const env: Env = {
    nodeEnv: "test",
    port: 0,
    mongoUri: mongoServer.getUri(),
    mongoMaxPoolSize: 20,
    mongoMinPoolSize: 0,
    mongoAutoIndex: true,
    pgEnabled: false,
    pgHost: "127.0.0.1",
    pgPort: 5432,
    pgDatabase: "remote_screen",
    pgUser: "postgres",
    pgPassword: "",
    pgPoolMax: 5,
    readFromPostgresPercentage: 0,
    jwtAccessSecret: "system-e2e-jwt-secret-at-least-32-bytes",
    jwtIssuer: "remote-screen-system-e2e",
    jwtAudience: "remote-screen-system-e2e-clients",
    deviceBootstrapKey: bootstrapKey,
    corsOrigin: "*",
    redisUrl: null,
    mediaStorageRoot: mediaRoot,
    mediaPublicBaseUrl: null,
    mediaMaxFileBytes: 2 * 1024 * 1024
  };

  await TenantModel.insertMany([
    { _id: tenantId, name: "System E2E Tenant", nameKey: tenantId, isActive: true },
    { _id: "tenant-other-e2e", name: "Other E2E Tenant", nameKey: "tenant-other-e2e", isActive: true }
  ]);
  const loginPassword = "System-E2E-Strong-Pass-2026!";
  const passwordHash = await hashPassword(loginPassword);
  await UserModel.insertMany([
    {
      tenantId,
      email: "system-e2e@demo.local",
      passwordHash,
      role: "operator",
      displayName: "System E2E Operator",
      isActive: true
    },
    {
      tenantId: "tenant-other-e2e",
      email: "other@demo.local",
      passwordHash,
      role: "tenant_owner",
      displayName: "Other E2E Owner",
      isActive: true
    }
  ]);
  httpServer = createServer(buildApp(env));
  socketServer = await createSocketServer(httpServer, {
    corsOrigin: env.corsOrigin,
    jwtSecret: env.jwtAccessSecret,
    jwtIssuer: env.jwtIssuer,
    jwtAudience: env.jwtAudience,
    redisUrl: null,
    nodeEnv: "test"
  });
  setSocketServer(socketServer);
  const port = await listen(httpServer);
  baseUrl = `http://127.0.0.1:${port}`;
  apiUrl = `${baseUrl}/api/v1`;

  await runCheck("Backend health and security headers", async () => {
    const { body, response } = await requestJson(`${apiUrl}/health`);
    assert.equal(body.ok, true);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
  });

  await runCheck("User token and dashboard socket ticket", async () => {
    const tokenResponse = await requestJson(
      `${apiUrl}/auth/login`,
      jsonRequest("POST", null, { email: "system-e2e@demo.local", password: loginPassword })
    );
    userToken = tokenResponse.body.access_token;
    assert.ok(userToken);
    const verifiedUser = jwt.verify(userToken, env.jwtAccessSecret, {
      issuer: env.jwtIssuer,
      audience: env.jwtAudience
    }) as jwt.JwtPayload;
    assert.ok(await UserModel.findById(String(verifiedUser.sub)).lean());
    assert.equal(await TenantModel.exists({ _id: tenantId, isActive: true }) !== null, true);

    const ticketResponse = await requestJson(
      `${apiUrl}/auth/socket-ticket`,
      jsonRequest("POST", userToken, {})
    );
    assert.ok(ticketResponse.body.ticket);
    dashboardSocket = createClient(`${baseUrl}/dashboard`, {
      auth: { token: ticketResponse.body.ticket },
      transports: ["websocket"],
      autoConnect: false,
      reconnection: false
    });
    await connectSocket(dashboardSocket);
  });

  await runCheck("Secure pairing and device session", async () => {
    const denied = await requestJson(
      `${apiUrl}/pairing/request-code`,
      jsonRequest("POST", null, { hardware_id: hardwareId, device_proof: deviceProof }),
      [401]
    );
    assert.equal(denied.body.code, "BOOTSTRAP_UNAUTHORIZED");

    const pairing = await requestJson(
      `${apiUrl}/pairing/request-code`,
      {
        ...jsonRequest("POST", null, { hardware_id: hardwareId, device_proof: deviceProof }),
        headers: { "content-type": "application/json", "x-device-bootstrap-key": bootstrapKey }
      },
      [201]
    );
    deviceId = pairing.body.device_id;
    assert.match(pairing.body.code, /^\d{6}$/);

    const confirmed = await requestJson(
      `${apiUrl}/pairing/confirm`,
      jsonRequest("POST", userToken, { pairing_code: pairing.body.code })
    );
    assert.equal(confirmed.body.linked, true);
    assert.equal(confirmed.body.device_id, deviceId);

    const wrongProof = await requestJson(
      `${apiUrl}/pairing/device-session`,
      {
        ...jsonRequest("POST", null, { hardware_id: hardwareId, device_proof: "wrong-device-proof-0123456789abcdef" }),
        headers: { "content-type": "application/json", "x-device-bootstrap-key": bootstrapKey }
      },
      [401]
    );
    assert.equal(wrongProof.body.code, "DEVICE_CREDENTIAL_INVALID");

    const session = await requestJson(
      `${apiUrl}/pairing/device-session`,
      {
        ...jsonRequest("POST", null, { hardware_id: hardwareId, device_proof: deviceProof }),
        headers: { "content-type": "application/json", "x-device-bootstrap-key": bootstrapKey }
      }
    );
    deviceToken = session.body.access_token;
    assert.equal(session.body.device_id, deviceId);
    assert.equal(session.body.expires_in, 172800);
  });

  await runCheck("Authenticated device connection and dashboard status relay", async () => {
    assert.ok(dashboardSocket);
    const statusEvent = waitForEvent<JsonRecord>(
      dashboardSocket,
      "DEVICE_STATUS",
      (payload) => payload.device_id === deviceId && payload.status === "online"
    );
    deviceSocket = createClient(`${baseUrl}/device`, {
      auth: { token: deviceToken },
      transports: ["websocket"],
      autoConnect: false,
      reconnection: false
    });
    await connectSocket(deviceSocket);
    const status = await statusEvent;
    assert.equal(status.hardware_id, hardwareId);
    deviceSocket.emit("HEARTBEAT", {
      playerVersion: "system-e2e-1.0.0",
      osVersion: "Android Simulation",
      resolution: "1920x1080"
    });
  });

  const pngBytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlS4AAAAASUVORK5CYII=",
    "base64"
  );

  await runCheck("Media validation, storage, download integrity and deduplication", async () => {
    const invalidForm = new FormData();
    invalidForm.append("file", new Blob(["not-an-image"], { type: "image/png" }), "corrupt.png");
    const invalid = await requestJson(
      `${apiUrl}/content/media/upload`,
      { method: "POST", headers: { authorization: `Bearer ${userToken}` }, body: invalidForm },
      [415]
    );
    assert.equal(invalid.body.code, "UNSUPPORTED_MEDIA_TYPE");

    const upload = async () => {
      const form = new FormData();
      form.append("file", new Blob([pngBytes], { type: "image/png" }), "pixel.png");
      return await requestJson(
        `${apiUrl}/content/media/upload`,
        { method: "POST", headers: { authorization: `Bearer ${userToken}` }, body: form },
        [200, 201]
      );
    };
    const first = await upload();
    assert.equal(first.status, 201);
    assert.equal(first.body.deduplicated, false);
    mediaId = first.body.media.id;
    const expectedChecksum = createHash("sha256").update(pngBytes).digest("hex");
    assert.equal(first.body.media.checksum_sha256, expectedChecksum);

    const download = await fetch(new URL(first.body.media.media_url, baseUrl));
    assert.equal(download.status, 200);
    const downloaded = Buffer.from(await download.arrayBuffer());
    assert.deepEqual(downloaded, pngBytes);
    assert.equal(createHash("sha256").update(downloaded).digest("hex"), expectedChecksum);

    const second = await upload();
    assert.equal(second.status, 200);
    assert.equal(second.body.deduplicated, true);
    assert.equal(second.body.media.id, mediaId);
  });

  await runCheck("Idempotent playlist creation and live publish", async () => {
    const requestId = "system_e2e_playlist_001";
    const createBody = {
      name: "System E2E Playlist",
      request_id: requestId,
      items: [{ media_id: mediaId, duration_ms: 5_000, position: 0 }]
    };
    const created = await requestJson(
      `${apiUrl}/content/playlists`,
      jsonRequest("POST", userToken, createBody),
      [201]
    );
    playlistId = created.body.playlist.id;
    playlistChecksum = created.body.playlist.content_checksum_sha256;
    assert.match(playlistChecksum, /^[a-f0-9]{64}$/);

    const duplicate = await requestJson(
      `${apiUrl}/content/playlists`,
      jsonRequest("POST", userToken, createBody)
    );
    assert.equal(duplicate.body.deduplicated, true);
    assert.equal(duplicate.body.playlist.id, playlistId);

    assert.ok(deviceSocket);
    const syncEvent = waitForEvent<JsonRecord>(
      deviceSocket,
      "SYNC_CONTENT",
      (payload) => payload.playlist_id === playlistId
    );
    const published = await requestJson(
      `${apiUrl}/content/playlists/${playlistId}/publish`,
      jsonRequest("POST", userToken, { device_ids: [deviceId, deviceId], expected_version: 1 })
    );
    const sync = await syncEvent;
    assert.equal(published.body.device_count, 1);
    assert.equal(published.body.checksum_sha256, playlistChecksum);
    assert.equal(sync.checksum_sha256, playlistChecksum);
    assert.equal(sync.items.length, 1);
    assert.equal(sync.items[0].media_id, mediaId);
  });

  const commandId = `system-e2e-command-${Date.now()}`;
  await runCheck("Offline command queue and idempotent dispatch", async () => {
    assert.ok(deviceSocket);
    deviceSocket.disconnect();

    const commandBody = {
      command_type: "SET_VOLUME",
      command_id: commandId,
      payload: { volume: 35 },
      timeout_ms: 8_000,
      max_attempts: 2
    };
    const queued = await requestJson(
      `${apiUrl}/commands/devices/${deviceId}/commands`,
      jsonRequest("POST", userToken, commandBody),
      [201]
    );
    assert.equal(queued.body.deduped, false);
    assert.equal(queued.body.command.status, "queued");

    const duplicate = await requestJson(
      `${apiUrl}/commands/devices/${deviceId}/commands`,
      jsonRequest("POST", userToken, commandBody)
    );
    assert.equal(duplicate.body.deduped, true);
    assert.equal(duplicate.body.command.command_id, commandId);
  });

  await runCheck("Network recovery, pending command replay and checksum-stable content sync", async () => {
    const reconnectingDevice = createClient(`${baseUrl}/device`, {
      auth: { token: deviceToken },
      transports: ["websocket"],
      autoConnect: false,
      reconnection: false
    });
    const replay = waitForEvent<JsonRecord>(
      reconnectingDevice,
      "COMMAND_DISPATCH",
      (payload) => payload.command_id === commandId
    );
    const sync = waitForEvent<JsonRecord>(
      reconnectingDevice,
      "SYNC_CONTENT",
      (payload) => payload.playlist_id === playlistId
    );
    await connectSocket(reconnectingDevice);
    const [replayedCommand, reconnectSync] = await Promise.all([replay, sync]);
    assert.equal(replayedCommand.attempt, 1);
    assert.equal(reconnectSync.checksum_sha256, playlistChecksum);
    assert.equal(reconnectSync.playlist_version, 1);
    deviceSocket = reconnectingDevice;

    const device = await DeviceModel.findById(deviceId).lean();
    assert.equal(device?.status, "online", "short network interruption must not leave device offline");
  });

  await runCheck("ACK validation, authenticated device attribution and dashboard relay", async () => {
    assert.ok(deviceSocket);
    assert.ok(dashboardSocket);
    const invalidAck = await emitWithAck<JsonRecord>(deviceSocket, "COMMAND_ACK", {
      command_id: "",
      status: "NOT_A_STATUS"
    });
    assert.deepEqual(invalidAck, { accepted: false, code: "INVALID_ACK" });

    const dashboardAck = waitForEvent<JsonRecord>(
      dashboardSocket,
      "COMMAND_ACK",
      (payload) => payload.command_id === commandId
    );
    const accepted = await emitWithAck<JsonRecord>(deviceSocket, "COMMAND_ACK", {
      device_id: "malicious-other-device",
      command_id: commandId,
      status: "COMPLETED",
      diagnostics: { simulated: true }
    });
    assert.deepEqual(accepted, { accepted: true });
    const relayed = await dashboardAck;
    dashboardAckDeviceId = relayed.device_id;
    assert.equal(relayed.device_id, deviceId);

    const detail = await requestJson(`${apiUrl}/commands/devices/${deviceId}/commands/${commandId}`, {
      headers: { authorization: `Bearer ${userToken}` }
    });
    assert.equal(detail.body.command.status, "completed");
    assert.equal(detail.body.command.command_id, commandId);
  });

  await runCheck("Tenant isolation and inaccessible device protection", async () => {
    const otherToken = await requestJson(
      `${apiUrl}/auth/login`,
      jsonRequest("POST", null, { email: "other@demo.local", password: loginPassword })
    );
    const inaccessible = await requestJson(
      `${apiUrl}/content/devices/${deviceId}`,
      { headers: { authorization: `Bearer ${otherToken.body.access_token}` } },
      [404]
    );
    assert.equal(inaccessible.body.code, "DEVICE_NOT_FOUND");

    const crossTenantCommand = await requestJson(
      `${apiUrl}/commands/devices/${deviceId}/commands`,
      jsonRequest("POST", otherToken.body.access_token, {
        command_type: "REBOOT_APP",
        command_id: `cross-tenant-${Date.now()}`,
        payload: {}
      }),
      [404]
    );
    assert.equal(crossTenantCommand.body.code, "DEVICE_NOT_FOUND");
  });


  await runCheck("Production dashboard browser login, fleet render and socket ticket", async () => {
    // Regression scenario: a stale database value says online, but there is no
    // authenticated device heartbeat. Both fleet and detail pages must show offline.
    deviceSocket?.disconnect();
    await DeviceModel.updateOne(
      { _id: deviceId },
      { $set: { status: "online", lastHeartbeatAt: null, lastSeenAt: new Date() } }
    );

    const dashboardPort = await allocatePort();
    const dashboardUrl = `http://localhost:${dashboardPort}`;
    const nextCli = path.resolve("node_modules", "next", "dist", "bin", "next");
    let dashboardErrors = "";
    dashboardProcess = spawn(process.execPath, [nextCli, "start", "-p", String(dashboardPort)], {
      cwd: path.resolve("dashboard"),
      windowsHide: true,
      env: {
        ...process.env,
        BACKEND_BASE_URL: baseUrl,
        BACKEND_PUBLIC_SOCKET_URL: baseUrl,
        NEXT_PUBLIC_BACKEND_SOCKET_URL: baseUrl
      },
      stdio: ["ignore", "ignore", "pipe"]
    });
    dashboardProcess.stderr?.on("data", (chunk: Buffer) => {
      dashboardErrors = (dashboardErrors + chunk.toString("utf8")).slice(-4_000);
    });
    await waitForHttp(`${dashboardUrl}/login`, dashboardProcess).catch((error) => {
      throw new Error(`${error instanceof Error ? error.message : String(error)}\n${dashboardErrors}`);
    });

    browser = await chromium.launch({ headless: true, executablePath: resolveBrowserExecutable() });
    const context = await browser.newContext({ baseURL: dashboardUrl });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.locator("#email").fill("system-e2e@demo.local");
    await page.locator("#password").fill(loginPassword);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL("**/screens", { timeout: 15_000 });
    await page.waitForFunction(
      (expectedHardwareId) => document.body.innerText.includes(String(expectedHardwareId)),
      hardwareId,
      { timeout: 15_000 }
    );

    const ticketResult = await page.evaluate(async () => {
      const response = await fetch("/api/socket-ticket", { method: "POST" });
      return { status: response.status, body: await response.json() };
    });
    assert.equal(ticketResult.status, 200);
    assert.equal(ticketResult.body.socket_url, baseUrl);
    assert.ok(ticketResult.body.ticket);

    for (const route of ["/media", "/playlists"]) {
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      assert.equal(response?.status(), 200, `${route} must render successfully`);
    }
    const detailResponse = await page.goto(`/screens/${deviceId}`, { waitUntil: "domcontentloaded" });
    assert.equal(detailResponse?.status(), 200, "screen detail must render successfully");
    await page.getByText("OFFLINE", { exact: true }).first().waitFor({ timeout: 15_000 });
    assert.equal(
      await page.getByText("ONLINE", { exact: true }).count(),
      0,
      "stale database status without a heartbeat must never render as online"
    );
    assert.deepEqual(pageErrors, [], `Browser page errors: ${pageErrors.join(" | ")}`);
    await context.close();
    await browser.close();
    browser = null;
    dashboardProcess.kill();
    dashboardProcess = null;
  });
  process.stdout.write(`\nSYSTEM_E2E_RESULT ${JSON.stringify({
    status: "PASS",
    checks: checks.length,
    elapsed_ms: Date.now() - startedAt,
    device_id: deviceId,
    playlist_id: playlistId,
    playlist_checksum: playlistChecksum,
    command_id: commandId,
    dashboard_ack_device_id: dashboardAckDeviceId
  })}\n`);
} catch (error) {
  process.stderr.write(`\nSYSTEM_E2E_RESULT ${JSON.stringify({
    status: "FAIL",
    checks: checks.length,
    elapsed_ms: Date.now() - startedAt,
    error: error instanceof Error ? error.stack ?? error.message : String(error)
  })}\n`);
  process.exitCode = 1;
} finally {
  deviceSocket?.disconnect();
  dashboardSocket?.disconnect();
  await browser?.close().catch(() => undefined);
  dashboardProcess?.kill();
  if (socketServer) {
    await closeSocketServer(socketServer).catch(() => undefined);
  } else if (httpServer) {
    await new Promise<void>((resolve) => httpServer?.close(() => resolve())).catch(() => undefined);
  }
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect().catch(() => undefined);
  }
  if (mongoServer) {
    await mongoServer.stop().catch(() => undefined);
  }
  if (mediaRoot) {
    await rm(mediaRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}
}

void main();
