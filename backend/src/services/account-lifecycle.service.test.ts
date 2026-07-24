import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import { DeviceModel } from "../models/device.model.js";
import { MediaFolderModel } from "../models/media-folder.model.js";
import { MediaModel } from "../models/media.model.js";
import { PlaylistModel } from "../models/playlist.model.js";
import { UserModel } from "../models/user.model.js";
import { deactivateUserAndTransferAssets } from "./account-lifecycle.service.js";

let mongoServer: MongoMemoryServer;

before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe("account lifecycle ownership transfer", () => {
  it("deactivates the account and transfers every tenant-owned asset without duplicate folders", async () => {
    const tenantId = "tenant-transfer-test";
    const [source, target] = await UserModel.create([
      {
        tenantId,
        email: "source@example.com",
        passwordHash: "x".repeat(60),
        role: "operator",
        displayName: "Source User",
        isActive: true
      },
      {
        tenantId,
        email: "owner@example.com",
        passwordHash: "x".repeat(60),
        role: "tenant_owner",
        displayName: "Owner User",
        isActive: true
      }
    ]);
    assert.ok(source);
    assert.ok(target);
    const sourceId = String(source._id);
    const targetId = String(target._id);

    await Promise.all([
      DeviceModel.create({ hardwareId: "transfer-hardware", tenantId, pairedOwnerUserId: sourceId }),
      MediaModel.create({
        tenantId,
        ownerUserId: sourceId,
        filename: "asset.png",
        mimeType: "image/png",
        sizeBytes: 100,
        checksumSha256: "c".repeat(64),
        storagePath: "uploads/test.png",
        publicUrl: "/uploads/test.png",
        status: "ready",
        folder: "Campaign"
      }),
      PlaylistModel.create({ tenantId, ownerUserId: sourceId, name: "Playlist", version: 1, items: [] }),
      MediaFolderModel.create({ tenantId, ownerUserId: sourceId, name: "Campaign" }),
      MediaFolderModel.create({ tenantId, ownerUserId: targetId, name: "Campaign" })
    ]);

    const result = await deactivateUserAndTransferAssets({
      tenantId,
      sourceUserId: sourceId,
      targetUserId: targetId,
      actorUserId: targetId
    });

    assert.deepEqual(result, { devices: 1, media: 1, playlists: 1, folders: 1 });
    const [updatedSource, device, media, playlist, folders] = await Promise.all([
      UserModel.findById(sourceId).lean(),
      DeviceModel.findOne({ hardwareId: "transfer-hardware" }).lean(),
      MediaModel.findOne({ checksumSha256: "c".repeat(64) }).lean(),
      PlaylistModel.findOne({ name: "Playlist" }).lean(),
      MediaFolderModel.find({ tenantId, ownerUserId: targetId, name: "Campaign" }).lean()
    ]);

    assert.equal(updatedSource?.isActive, false);
    assert.equal(updatedSource?.deactivatedByUserId, targetId);
    assert.equal(device?.pairedOwnerUserId, targetId);
    assert.equal(media?.ownerUserId, targetId);
    assert.equal(playlist?.ownerUserId, targetId);
    assert.equal(folders.length, 1);
  });
});