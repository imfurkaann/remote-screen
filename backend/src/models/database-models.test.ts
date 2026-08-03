import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DeviceModel } from "./device.model.js";
import { MediaModel } from "./media.model.js";
import { PairingCodeModel } from "./pairing-code.model.js";
import { PlaylistModel } from "./playlist.model.js";
import { UserModel } from "./user.model.js";

describe("database model hardening", () => {
  it("declares one active pairing code per device and one active code value", () => {
    const indexes = PairingCodeModel.schema.indexes();
    assert.ok(
      indexes.some(
        ([keys, options]) =>
          keys.deviceId === 1 &&
          options.unique === true &&
          options.name === "unique_active_pairing_code_per_device"
      )
    );
    assert.ok(
      indexes.some(
        ([keys, options]) =>
          keys.code === 1 &&
          options.unique === true &&
          options.name === "unique_active_pairing_code_value"
      )
    );

    const missingCredential = new PairingCodeModel({
      deviceId: "507f1f77bcf86cd799439011",
      code: "123456",
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null
    });
    assert.ok(missingCredential.validateSync()?.errors.deviceCredentialHash);

    const validCode = new PairingCodeModel({
      deviceId: "507f1f77bcf86cd799439011",
      code: "123456",
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      deviceCredentialHash: "a".repeat(64)
    });
    assert.equal(validCode.claimedAt, null);
    assert.equal(validCode.claimedBy, null);
    assert.equal(validCode.validateSync(), undefined);
  });

  it("rejects malformed media checksums and oversized playlists", () => {
    const media = new MediaModel({
      tenantId: "tenant",
      filename: "demo.png",
      mimeType: "image/png",
      sizeBytes: 10,
      checksumSha256: "invalid",
      storagePath: "uploads/demo.png",
      publicUrl: "/uploads/demo.png",
      status: "ready"
    });
    assert.ok(media.validateSync()?.errors.checksumSha256);

    const item = {
      mediaId: "507f1f77bcf86cd799439011",
      filename: "demo.png",
      mediaUrl: "/uploads/demo.png",
      checksumSha256: "a".repeat(64),
      mimeType: "image/png",
      durationMs: 1_000,
      position: 0
    };
    const playlist = new PlaylistModel({
      tenantId: "tenant",
      name: "Playlist",
      nameKey: "playlist",
      version: 1,
      items: Array.from({ length: 501 }, () => item)
    });
    assert.ok(playlist.validateSync()?.errors.items);
  });

  it("stores nullable Android screen power telemetry", () => {
    const unknown = new DeviceModel({ hardwareId: "screen-unknown" });
    const awake = new DeviceModel({ hardwareId: "screen-awake", screenOn: true });

    assert.equal(unknown.screenOn, null);
    assert.equal(awake.screenOn, true);
    assert.equal(awake.validateSync(), undefined);
  });

  it("keeps password hashes excluded from ordinary user queries", () => {
    assert.equal(UserModel.schema.path("passwordHash").options.select, false);
    assert.equal(UserModel.schema.path("email").options.unique, true);
  });
});
