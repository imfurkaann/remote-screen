import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { databaseIdentityToUuid, isUuid } from "./identity.js";

describe("database identity mapping", () => {
  it("maps a Mongo ObjectId deterministically to a valid UUID", () => {
    const mapped = databaseIdentityToUuid("64b64c3f2f9f5f1d2a3b4c5d");
    assert.equal(mapped, "00000000-64b6-4c3f-2f9f-5f1d2a3b4c5d");
    assert.equal(isUuid(mapped), true);
  });

  it("keeps valid UUIDs and rejects unsafe fallback identities", () => {
    const uuid = "d3b07384-d113-4956-a5e2-e1c7edd47b97";
    assert.equal(databaseIdentityToUuid(uuid), uuid);
    assert.throws(() => databaseIdentityToUuid("not-an-id"), /DATABASE_IDENTITY_INVALID/);
  });
});
