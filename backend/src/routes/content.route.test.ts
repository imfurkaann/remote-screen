import { createServer, type Server } from "node:http";
import { after, afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

import { buildApp } from "../app.js";
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
  corsOrigin: "*"
};

let server: Server | null = null;

before(async () => {
  await mongoose.connect(env.mongoUri);
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
    DeviceModel.deleteMany({}),
    MediaModel.deleteMany({}),
    PlaylistModel.deleteMany({})
  ]);

  await rm(path.resolve(process.cwd(), "uploads", "media", "tenant-test"), {
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

function makeUserToken(role: "tenant_admin" | "tenant_owner" | "operator" = "tenant_admin"): string {
  return jwt.sign(
    {
      sub: "user-demo",
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
      new Blob([Buffer.from("hello content")], { type: "text/plain" }),
      "poster.txt"
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

    assert.equal(uploadPayload.media.filename, "poster.txt");
    assert.equal(uploadPayload.media.checksum_sha256.length, 64);

    const mediaDoc = await MediaModel.findOne({ tenantId: "tenant-test", filename: "poster.txt" }).lean();
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
  });

  it("publishes playlists and emits SYNC_CONTENT to both device ids and hardware ids", async () => {
    const baseUrl = await startServer();
    const token = makeUserToken("tenant_owner");

    const emitted: Array<{ namespace: string; room: string; event: string; payload: unknown }> = [];
    setSocketServer(
      {
        of(namespace: string) {
          return {
            to(room: string) {
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
      new Blob([Buffer.from("sync payload")], { type: "text/plain" }),
      "sync.txt"
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

    const publishResponse = await fetch(
      `${baseUrl}/api/v1/content/playlists/${playlistPayload.playlist.id}/publish`,
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
    assert.equal(syncEvents.length, 2);
    assert.deepEqual(
      syncEvents.map((entry) => entry.namespace),
      ["/device", "/device"]
    );
    assert.deepEqual(
      syncEvents.map((entry) => entry.room).sort(),
      [`device:${device.hardwareId}`, `device:${device._id.toString()}`].sort()
    );

    const firstPayload = syncEvents[0]?.payload as { playlist_id?: string; items?: Array<{ checksum_sha256: string }> };
    assert.equal(firstPayload?.playlist_id, playlistPayload.playlist.id);
    assert.equal(firstPayload?.items?.[0]?.checksum_sha256.length, 64);
  });

  it("deletes a playlist and clears it from assigned devices", async () => {
    const baseUrl = await startServer();
    const token = makeUserToken("tenant_owner");

    // 1. Create a playlist
    const uploadForm = new FormData();
    uploadForm.set(
      "file",
      new Blob([Buffer.from("delete payload")], { type: "text/plain" }),
      "delete.txt"
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

    const emitted: Array<{ namespace: string; room: string; event: string; payload: unknown }> = [];
    setSocketServer(
      {
        of(namespace: string) {
          return {
            to(room: string) {
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
});