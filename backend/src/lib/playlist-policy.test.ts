import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Types } from "mongoose";

import {
  normalizeCreationKey,
  normalizePlaylistName,
  parsePlaylistItems,
  playlistContentChecksum
} from "./playlist-policy.js";

describe("playlist policy", () => {
  it("normalizes names and rejects unsafe or duplicate positions", () => {
    assert.deepEqual(normalizePlaylistName("  Sabah   Yayını  "), {
      name: "Sabah Yayını",
      nameKey: "sabah yayını"
    });
    const mediaId = new Types.ObjectId().toString();
    assert.ok(parsePlaylistItems([{ media_id: mediaId, duration_ms: 5000, position: 0 }], 500).items.length === 1);
    assert.ok(parsePlaylistItems([
      { media_id: mediaId, duration_ms: 5000, position: 0 },
      { media_id: mediaId, duration_ms: 5000, position: 0 }
    ], 500).error);
  });

  it("bounds item duration and validates idempotency keys", () => {
    const mediaId = new Types.ObjectId().toString();
    assert.ok(parsePlaylistItems([{ media_id: mediaId, duration_ms: 999, position: 0 }], 500).error);
    assert.equal(normalizeCreationKey("request_123456"), "request_123456");
    assert.equal(normalizeCreationKey("bad key"), null);
  });

  it("includes playback-affecting fields in the content checksum", () => {
    const base = [{
      mediaId: new Types.ObjectId().toString(),
      mediaUrl: "/uploads/a.png",
      checksumSha256: "a".repeat(64),
      mimeType: "image/png",
      durationMs: 5000,
      position: 0
    }];
    assert.notEqual(playlistContentChecksum(base), playlistContentChecksum([{ ...base[0]!, durationMs: 6000 }]));
  });
});
