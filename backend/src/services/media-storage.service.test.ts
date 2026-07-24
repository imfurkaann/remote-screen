import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  canonicalMediaFilename,
  inspectMediaFile,
  LocalMediaStorage
} from "./media-storage.service.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("local media storage", () => {
  it("detects real file contents and canonicalizes the extension", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "remote-screen-media-test-"));
    roots.push(root);
    const file = path.join(root, "payload.tmp");
    await writeFile(file, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]));
    const inspected = await inspectMediaFile(file);
    assert.equal(inspected.mimeType, "image/png");
    assert.equal(inspected.sizeBytes, 11);
    assert.equal(inspected.checksumSha256.length, 64);
    assert.equal(canonicalMediaFilename("../../payload.html", "image/png"), "payload.png");
  });

  it("commits files under the storage root and blocks traversal", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "remote-screen-media-test-"));
    roots.push(root);
    const storage = new LocalMediaStorage({ rootDir: root, publicBaseUrl: "/uploads" });
    const tempDir = await storage.ensureTempDir();
    const tempPath = path.join(tempDir, "upload.tmp");
    await writeFile(tempPath, "content");
    const stored = await storage.commit({
      tempPath,
      tenantId: "tenant-test",
      ownerUserId: "user-test",
      checksumSha256: "a".repeat(64),
      filename: "poster.png"
    });
    assert.ok(stored.absolutePath.startsWith(root));
    assert.equal(storage.resolveStoredPath("../../outside.txt"), null);
    await storage.delete(stored.storagePath);
  });
});
