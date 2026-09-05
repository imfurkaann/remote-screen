import { createServer, type Server } from "node:http";
import { after, afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { access, rm } from "node:fs/promises";
import path from "node:path";
import jwt from "jsonwebtoken";
import mongoose, { Types } from "mongoose";

import { buildApp } from "../app.js";
import { CommandModel } from "../models/command.model.js";
import { DeviceModel } from "../models/device.model.js";
import { MediaModel } from "../models/media.model.js";
import { PlaylistModel } from "../models/playlist.model.js";
import { setSocketServer } from "../sockets/registry.js";

const env = {
  nodeEnv: "test",
  port: 0,
  mongoUri: "mongodb://localhost:27017/unused",
  pgEnabled: false,
  pgHost: "localhost",
  pgPort: 5432,
  pgDatabase: "remote_screen",
  pgUser: "postgres",
  pgPassword: "",
  pgPoolMax: 20,
  readFromPostgresPercentage: 0,
  jwtAccessSecret: "test-secret",
  jwtIssuer: "remote-screen",
  jwtAudience: "remote-screen-clients",
  deviceBootstrapKey: "bootstrap-secret",
  corsOrigin: "*",
  mediaMaxFileBytes: 64
};

function pngPayload(label: string): ArrayBuffer {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const text = Array.from(new TextEncoder().encode(label));
  return Uint8Array.from([...signature, ...text]).buffer;
}

let server: Server | null = null;

before(async () => {
  await mongoose.connect(env.mongoUri);
  await Promise.all([MediaModel.syncIndexes(), PlaylistModel.syncIndexes()]);
});

after(async () => {
  await mongoose.disconnect();
  setSocketServer({
    of() {
      return {
        to() {
          return {
            emit() {
              return undefined;
            }
          };
        }
      };
    }
  } as never);
});

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => {
      server?.close(() => resolve());
    });
    server = null;
  }

  await Promise.all([
    CommandModel.deleteMany({}),
    DeviceModel.deleteMany({}),
    MediaModel.deleteMany({}),
    PlaylistModel.deleteMany({})
  ]);

  await rm(path.resolve(process.cwd(), "uploads", "media", "tenant-test"), {
    recursive: true,
    force: true
  });
  await rm(path.resolve(process.cwd(), "uploads", "screenshots", "tenant-test"), {
    recursive: true,
    force: true
  });
});

async function startServer(): Promise<string> {
  const app = buildApp(env);
  server = createServer(app);

  await new Promise<void>((resolve) => {
    server?.listen(0, () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to acquire test server address");
  }

  return `http://127.0.0.1:${address.port}`;
}

function makeUserToken(
  role: "tenant_admin" | "tenant_owner" | "operator" = "tenant_admin",
  userId = "user-demo"
): string {
  return jwt.sign(
    {
      sub: userId,
      tenant_id: "tenant-test",
      role
    },
    env.jwtAccessSecret,
    {
      issuer: env.jwtIssuer,
      audience: env.jwtAudience,
      notBefore: "0s",
      expiresIn: "5m"
    }
  );
}

describe("content lifecycle", () => {
  it("uploads media and creates playlists with persisted checksum-backed items", async () => {
    const baseUrl = await startServer();
    const token = makeUserToken();

    const uploadForm = new FormData();
    uploadForm.set(
      "file",
      new Blob([pngPayload("hello content")], { type: "text/html" }),
      "poster.png"
    );

    const uploadResponse = await fetch(`${baseUrl}/api/v1/content/media/upload`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`
      },
      body: uploadForm
    });

    assert.equal(uploadResponse.status, 201);

    const uploadPayload = (await uploadResponse.json()) as {
      media: {
        id: string;
        filename: string;
        checksum_sha256: string;
        media_url: string;
      };
    };

    assert.equal(uploadPayload.media.filename, "poster.png");
    assert.equal(uploadPayload.media.checksum_sha256.length, 64);

    const mediaDoc = await MediaModel.findOne({ tenantId: "tenant-test", filename: "poster.png" }).lean();
    assert.ok(mediaDoc);
    assert.equal(mediaDoc?.checksumSha256, uploadPayload.media.checksum_sha256);

    const playlistResponse = await fetch(`${baseUrl}/api/v1/content/playlists`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        name: "Morning Loop",
        request_id: "morning_request_123",
        items: [
          {
            media_id: uploadPayload.media.id,
            duration_ms: 12000,
            position: 0
          }
        ]
      })
    });

    assert.equal(playlistResponse.status, 201);

    const playlistPayload = (await playlistResponse.json()) as {
      playlist: {
        id: string;
        name: string;
        version: number;
        item_count: number;
      };
    };

    assert.equal(playlistPayload.playlist.name, "Morning Loop");
    assert.equal(playlistPayload.playlist.item_count, 1);

    const playlistDoc = await PlaylistModel.findOne({ tenantId: "tenant-test", name: "Morning Loop" }).lean();
    assert.ok(playlistDoc);
    assert.equal(playlistDoc?.items.length, 1);
    assert.equal(playlistDoc?.items[0]?.checksumSha256, uploadPayload.media.checksum_sha256);

    const repeatedCreate = await fetch(baseUrl + "/api/v1/content/playlists", {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({
        name: "Morning Loop",
        request_id: "morning_request_123",
        items: [{ media_id: uploadPayload.media.id, duration_ms: 12000, position: 0 }]
      })
    });
    assert.equal(repeatedCreate.status, 200);
    assert.equal(((await repeatedCreate.json()) as any).playlist.id, playlistPayload.playlist.id);

    const staleUpdate = await fetch(baseUrl + "/api/v1/content/playlists/" + playlistPayload.playlist.id, {
      method: "PUT",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({
        name: "Morning Loop Updated",
        expected_version: 99,
        items: [{ media_id: uploadPayload.media.id, duration_ms: 12000, position: 0 }]
      })
    });
    assert.equal(staleUpdate.status, 409);
    assert.equal(((await staleUpdate.json()) as any).code, "PLAYLIST_VERSION_CONFLICT");
  });

  it("deduplicates identical account media and rejects unsupported uploads", async () => {
    const baseUrl = await startServer();
    const token = makeUserToken("tenant_owner");

    const upload = async (content: string, type: string, filename: string) => {
      const form = new FormData();
      form.set("file", new Blob([type === "image/png" ? pngPayload(content) : new TextEncoder().encode(content).buffer], { type }), filename);
      return fetch(`${baseUrl}/api/v1/content/media/upload`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: form
      });
    };

    const [first, second] = await Promise.all([
      upload("same image", "image/png", "safe.png"),
      upload("same image", "image/png", "duplicate.png")
    ]);
    assert.deepEqual([first.status, second.status].sort(), [200, 201]);
    const payloads = await Promise.all([first.json(), second.json()]) as Array<{ deduplicated: boolean }>;
    assert.equal(payloads.filter((payload) => payload.deduplicated).length, 1);
    assert.equal(await MediaModel.countDocuments({ tenantId: "tenant-test" }), 1);

    const oversizedBytes = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ...new Array(80).fill(1)
    ]).buffer;
    const oversizedForm = new FormData();
    oversizedForm.set("file", new Blob([oversizedBytes], { type: "image/png" }), "large.png");
    const oversized = await fetch(baseUrl + "/api/v1/content/media/upload", {
      method: "POST",
      headers: { authorization: "Bearer " + token },
      body: oversizedForm
    });
    assert.equal(oversized.status, 413);

    const unsupported = await upload("script", "text/html", "payload.html");
    assert.equal(unsupported.status, 415);
    assert.equal(await MediaModel.countDocuments({ tenantId: "tenant-test" }), 1);
  });
  it("allows tenant admins to manage tenant assets while keeping operators isolated", async () => {
    const baseUrl = await startServer();
    await MediaModel.create([
      {
        tenantId: "tenant-test",
        ownerUserId: "user-demo",
        filename: "own.png",
        mimeType: "image/png",
        sizeBytes: 10,
        checksumSha256: "a".repeat(64),
        storagePath: "uploads/own.png",
        publicUrl: "/uploads/own.png",
        status: "ready",
        folder: null
      },
      {
        tenantId: "tenant-test",
        ownerUserId: "another-user",
        filename: "shared.png",
        mimeType: "image/png",
        sizeBytes: 10,
        checksumSha256: "b".repeat(64),
        storagePath: "uploads/shared.png",
        publicUrl: "/uploads/shared.png",
        status: "ready",
        folder: null
      }
    ]);

    const adminResponse = await fetch(`${baseUrl}/api/v1/content/media?folder=root`, {
      headers: { authorization: `Bearer ${makeUserToken("tenant_admin")}` }
    });
    assert.equal(adminResponse.status, 200);
    const adminPayload = (await adminResponse.json()) as { total: number };
    assert.equal(adminPayload.total, 2);

    const operatorResponse = await fetch(`${baseUrl}/api/v1/content/media?folder=root`, {
      headers: { authorization: `Bearer ${makeUserToken("operator")}` }
    });
    assert.equal(operatorResponse.status, 200);
    const operatorPayload = (await operatorResponse.json()) as { total: number };
    assert.equal(operatorPayload.total, 1);
  });
  it("separates apps from uploaded media for playlist libraries", async () => {
    const baseUrl = await startServer();
    await MediaModel.create([
      {
        tenantId: "tenant-test", ownerUserId: "user-demo", filename: "Lobby Guide", mimeType: "text/html",
        sizeBytes: 0, checksumSha256: "c".repeat(64), storagePath: "app://wayfinding?id=test",
        publicUrl: "/api/v1/apps/render/test", status: "ready", folder: null
      },
      {
        tenantId: "tenant-test", ownerUserId: "user-demo", filename: "lobby.png", mimeType: "image/png",
        sizeBytes: 10, checksumSha256: "d".repeat(64), storagePath: "uploads/lobby.png",
        publicUrl: "/uploads/lobby.png", status: "ready", folder: null
      }
    ]);

    const headers = { authorization: `Bearer ${makeUserToken("operator")}` };
    const [appsResponse, mediaResponse, invalidResponse] = await Promise.all([
      fetch(`${baseUrl}/api/v1/content/media?kind=apps`, { headers }),
      fetch(`${baseUrl}/api/v1/content/media?kind=media`, { headers }),
      fetch(`${baseUrl}/api/v1/content/media?kind=unknown`, { headers })
    ]);
    assert.equal(appsResponse.status, 200);
    assert.equal(mediaResponse.status, 200);
    assert.equal(invalidResponse.status, 400);

    const appsPayload = (await appsResponse.json()) as { media: Array<{ filename: string; storage_path: string }> };
    const mediaPayload = (await mediaResponse.json()) as { media: Array<{ filename: string }> };
    assert.deepEqual(appsPayload.media.map((item) => item.filename), ["Lobby Guide"]);
    assert.equal(appsPayload.media[0]?.storage_path, "app://wayfinding?id=test");
    assert.deepEqual(mediaPayload.media.map((item) => item.filename), ["lobby.png"]);
  });

  it("detaches removed screens without deleting hardware identity or replaying old commands", async () => {
    const baseUrl = await startServer();
    const device = await DeviceModel.create({
      tenantId: "tenant-test",
      hardwareId: "hardware-detach-test",
      status: "online",
      pairedOwnerUserId: "user-demo",
      currentPlaylistId: null
    });
    const command = await CommandModel.create({
      tenantId: "tenant-test",
      deviceId: String(device._id),
      commandId: "detach-command",
      commandType: "FORCE_REFRESH",
      payload: {},
      status: "queued",
      attempts: 0,
      maxAttempts: 2,
      timeoutMs: 15_000
    });

    const response = await fetch(`${baseUrl}/api/v1/content/devices/${device._id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${makeUserToken("tenant_owner")}` }
    });
    assert.equal(response.status, 204);

    const [detachedDevice, failedCommand] = await Promise.all([
      DeviceModel.findById(device._id).lean(),
      CommandModel.findById(command._id).lean()
    ]);
    assert.ok(detachedDevice);
    assert.equal(detachedDevice.tenantId, null);
    assert.equal(detachedDevice.pairedOwnerUserId, null);
    assert.equal(detachedDevice.status, "offline");
    assert.equal(failedCommand?.status, "failed");
  });
  it("publishes playlists with one canonical fleet fan-out", async () => {
    const baseUrl = await startServer();
    const token = makeUserToken("tenant_owner");

    const emitted: Array<{ namespace: string; room: string | string[]; event: string; payload: unknown }> = [];
    setSocketServer(
      {
        of(namespace: string) {
          return {
            to(room: string | string[]) {
              return {
                emit(event: string, payload: unknown) {
                  emitted.push({ namespace, room, event, payload });
                }
              };
            }
          };
        }
      } as never
    );

    const uploadForm = new FormData();
    uploadForm.set(
      "file",
      new Blob([pngPayload("sync payload")], { type: "image/png" }),
      "sync.png"
    );

    const uploadResponse = await fetch(`${baseUrl}/api/v1/content/media/upload`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: uploadForm
    });

    const uploadPayload = (await uploadResponse.json()) as { media: { id: string } };

    const playlistResponse = await fetch(`${baseUrl}/api/v1/content/playlists`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        name: "Sync Playlist",
        items: [
          {
            media_id: uploadPayload.media.id,
            duration_ms: 9000,
            position: 0
          }
        ]
      })
    });

    const playlistPayload = (await playlistResponse.json()) as { playlist: { id: string } };

    const device = await DeviceModel.create({
      tenantId: "tenant-test",
      hardwareId: "hw-sync-1",
      status: "offline",
      pairedOwnerUserId: "user-demo",
      currentPlaylistId: null,
      lastHeartbeatAt: null,
      lastSeenAt: null
    });

    const missingTargetResponse = await fetch(
      baseUrl + "/api/v1/content/playlists/" + playlistPayload.playlist.id + "/publish",
      {
        method: "POST",
        headers: { authorization: "Bearer " + token, "content-type": "application/json" },
        body: JSON.stringify({ device_ids: [String(device._id), new Types.ObjectId().toString()] })
      }
    );
    assert.equal(missingTargetResponse.status, 404);
    assert.equal((await DeviceModel.findById(device._id).lean())?.currentPlaylistId, null);

    const publishResponse = await fetch(      `${baseUrl}/api/v1/content/playlists/${playlistPayload.playlist.id}/publish`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({ device_ids: [String(device._id)] })
      }
    );

    assert.equal(publishResponse.status, 200);

    const publishPayload = (await publishResponse.json()) as {
      published: boolean;
      playlist_id: string;
      device_count: number;
    };

    assert.equal(publishPayload.published, true);
    assert.equal(publishPayload.device_count, 1);

    const updatedDevice = await DeviceModel.findOne({ _id: device._id }).lean();
    assert.equal(updatedDevice?.currentPlaylistId, playlistPayload.playlist.id);

    const syncEvents = emitted.filter((entry) => entry.event === "SYNC_CONTENT");
    assert.equal(syncEvents.length, 1);
    assert.equal(syncEvents[0]?.namespace, "/device");
    assert.deepEqual(syncEvents[0]?.room, [`device:${device._id.toString()}`]);

    const firstPayload = syncEvents[0]?.payload as { playlist_id?: string; items?: Array<{ checksum_sha256: string }> };
    assert.equal(firstPayload?.playlist_id, playlistPayload.playlist.id);
    assert.equal(firstPayload?.items?.[0]?.checksum_sha256.length, 64);
  });

  it("refreshes assigned playlists and notifies screens when an app is updated", async () => {
    const baseUrl = await startServer();
    const token = makeUserToken("tenant_owner");
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

    const createAppResponse = await fetch(`${baseUrl}/api/v1/apps/create-app`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "Lobby Clock",
        appType: "clock",
        config: { timezone: "Europe/Istanbul", showSeconds: true }
      })
    });
    assert.equal(createAppResponse.status, 201);
    const createAppPayload = (await createAppResponse.json()) as {
      app: { _id: string; checksumSha256: string };
    };

    const createPlaylistResponse = await fetch(`${baseUrl}/api/v1/content/playlists`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "Single Media: Lobby Clock",
        items: [{ media_id: createAppPayload.app._id, duration_ms: 10_000, position: 0 }]
      })
    });
    assert.equal(createPlaylistResponse.status, 201);
    const createPlaylistPayload = (await createPlaylistResponse.json()) as {
      playlist: { id: string; version: number };
    };

    const device = await DeviceModel.create({
      tenantId: "tenant-test",
      hardwareId: "hw-app-refresh-1",
      status: "online",
      pairedOwnerUserId: "user-demo",
      currentPlaylistId: createPlaylistPayload.playlist.id,
      lastHeartbeatAt: new Date(),
      lastSeenAt: new Date()
    });
    const emitted: Array<{ event: string; payload: unknown }> = [];
    setSocketServer({
      of() {
        return {
          to() {
            return {
              emit(event: string, payload: unknown) {
                emitted.push({ event, payload });
              }
            };
          }
        };
      }
    } as never);

    const updateResponse = await fetch(
      `${baseUrl}/api/v1/apps/update-app/${createAppPayload.app._id}`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({
          name: "Lobby Clock",
          config: { timezone: "Europe/Istanbul", showSeconds: false, theme: "paper" }
        })
      }
    );
    assert.equal(updateResponse.status, 200);
    const updatePayload = (await updateResponse.json()) as {
      app: { checksumSha256: string };
      playlists_updated: number;
      devices_notified: number;
    };
    assert.notEqual(updatePayload.app.checksumSha256, createAppPayload.app.checksumSha256);
    assert.equal(updatePayload.playlists_updated, 1);
    assert.equal(updatePayload.devices_notified, 1);

    const refreshedPlaylist = await PlaylistModel.findById(createPlaylistPayload.playlist.id).lean();
    assert.equal(refreshedPlaylist?.version, createPlaylistPayload.playlist.version + 1);
    assert.equal(refreshedPlaylist?.publishedVersion, refreshedPlaylist?.version);
    assert.equal(refreshedPlaylist?.items[0]?.checksumSha256, updatePayload.app.checksumSha256);
    assert.equal(refreshedPlaylist?.contentChecksumSha256.length, 64);

    const syncEvents = emitted.filter((entry) => entry.event === "SYNC_CONTENT");
    assert.equal(syncEvents.length, 1);
    const syncPayload = syncEvents[0]?.payload as {
      playlist_version: number;
      checksum_sha256: string;
      items: Array<{ checksum_sha256: string }>;
    };
    assert.equal(syncPayload.playlist_version, refreshedPlaylist?.version);
    assert.equal(syncPayload.checksum_sha256, refreshedPlaylist?.contentChecksumSha256);
    assert.equal(syncPayload.items[0]?.checksum_sha256, updatePayload.app.checksumSha256);
    assert.equal((await DeviceModel.findById(device._id).lean())?.currentPlaylistId, createPlaylistPayload.playlist.id);

    const renderResponse = await fetch(
      `${baseUrl}/api/v1/apps/render/${createAppPayload.app._id}?rs_rev=${updatePayload.app.checksumSha256.slice(0, 16)}`
    );
    assert.equal(renderResponse.status, 200);
    assert.match(renderResponse.headers.get("cache-control") ?? "", /immutable/);
    assert.match(await renderResponse.text(), /window\.__remoteScreenTick = update/);

    const unversionedRender = await fetch(`${baseUrl}/api/v1/apps/render/${createAppPayload.app._id}`);
    assert.match(unversionedRender.headers.get("cache-control") ?? "", /must-revalidate/);
  });

  it("deletes a playlist and clears it from assigned devices", async () => {
    const baseUrl = await startServer();
    const token = makeUserToken("tenant_owner");

    // 1. Create a playlist
    const uploadForm = new FormData();
    uploadForm.set(
      "file",
      new Blob([pngPayload("delete payload")], { type: "image/png" }),
      "delete.png"
    );

    const uploadResponse = await fetch(`${baseUrl}/api/v1/content/media/upload`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: uploadForm
    });
    const uploadPayload = (await uploadResponse.json()) as { media: { id: string } };

    const playlistResponse = await fetch(`${baseUrl}/api/v1/content/playlists`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        name: "Delete Playlist",
        items: [
          {
            media_id: uploadPayload.media.id,
            duration_ms: 5000,
            position: 0
          }
        ]
      })
    });
    const playlistPayload = (await playlistResponse.json()) as { playlist: { id: string } };

    // 2. Create a device and assign the playlist
    const device = await DeviceModel.create({
      tenantId: "tenant-test",
      hardwareId: "hw-delete-1",
      status: "offline",
      pairedOwnerUserId: "user-demo",
      currentPlaylistId: playlistPayload.playlist.id,
      lastHeartbeatAt: null,
      lastSeenAt: null
    });

    const emitted: Array<{ namespace: string; room: string | string[]; event: string; payload: unknown }> = [];
    setSocketServer(
      {
        of(namespace: string) {
          return {
            to(room: string | string[]) {
              return {
                emit(event: string, payload: unknown) {
                  emitted.push({ namespace, room, event, payload });
                }
              };
            }
          };
        }
      } as never
    );

    // 3. Delete the playlist
    const deleteResponse = await fetch(
      `${baseUrl}/api/v1/content/playlists/${playlistPayload.playlist.id}`,
      {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${token}`
        }
      }
    );

    assert.equal(deleteResponse.status, 204);

    // Check it's deleted from Mongo
    const dbPlaylist = await PlaylistModel.findById(playlistPayload.playlist.id);
    assert.equal(dbPlaylist, null);

    // Check device currentPlaylistId is cleared
    const updatedDevice = await DeviceModel.findById(device._id).lean();
    assert.equal(updatedDevice?.currentPlaylistId, null);

    // Check SYNC_CONTENT was emitted with null playlist_id
    const syncEvents = emitted.filter((entry) => entry.event === "SYNC_CONTENT");
    assert.ok(syncEvents.length > 0);
    const lastEvent = syncEvents[syncEvents.length - 1];
    const payload = lastEvent?.payload as { playlist_id: string | null };
    assert.equal(payload?.playlist_id, null);
  });

  it("stores one private, authenticated preview per device", async () => {
    const baseUrl = await startServer();
    const token = makeUserToken();
    const device = await DeviceModel.create({
      tenantId: "tenant-test",
      hardwareId: "hw-private-preview",
      status: "online",
      pairedOwnerUserId: "user-demo"
    });

    const uploadPreview = async (marker: number) => {
      const form = new FormData();
      form.set(
        "file",
        new Blob([Uint8Array.from([0xff, 0xd8, 0xff, marker, 0xff, 0xd9])], { type: "image/jpeg" }),
        "preview.jpg"
      );
      return fetch(`${baseUrl}/api/v1/commands/devices/${String(device._id)}/screenshot`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: form
      });
    };

    const firstResponse = await uploadPreview(1);
    assert.equal(firstResponse.status, 201);
    const first = (await firstResponse.json()) as { screenshot_url: string };

    const directResponse = await fetch(`${baseUrl}${first.screenshot_url}`);
    assert.equal(directResponse.status, 404);

    const authenticatedResponse = await fetch(
      `${baseUrl}/api/v1/commands/devices/${String(device._id)}/preview`,
      { headers: { authorization: `Bearer ${token}` } }
    );
    assert.equal(authenticatedResponse.status, 200);
    assert.equal(authenticatedResponse.headers.get("cache-control"), "private, no-store");

    const unauthenticatedResponse = await fetch(
      `${baseUrl}/api/v1/commands/devices/${String(device._id)}/preview`
    );
    assert.equal(unauthenticatedResponse.status, 401);

    const otherUserResponse = await fetch(
      `${baseUrl}/api/v1/commands/devices/${String(device._id)}/preview`,
      { headers: { authorization: `Bearer ${makeUserToken("tenant_admin", "user-other")}` } }
    );
    assert.equal(otherUserResponse.status, 404);

    const secondResponse = await uploadPreview(2);
    assert.equal(secondResponse.status, 201);
    const second = (await secondResponse.json()) as { screenshot_url: string };
    assert.notEqual(second.screenshot_url, first.screenshot_url);

    const firstAbsolutePath = path.resolve(process.cwd(), first.screenshot_url.replace(/^\//, ""));
    await assert.rejects(access(firstAbsolutePath));
    const storedDevice = await DeviceModel.findById(device._id).lean();
    assert.equal(storedDevice?.previewUrl, second.screenshot_url);
    assert.ok(storedDevice?.previewCapturedAt instanceof Date);
  });
});
