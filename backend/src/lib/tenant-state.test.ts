import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isTenantActive, SYSTEM_TENANT_ID } from "./tenant-state.js";

describe("tenant state", () => {
  it("treats the internal super-admin system workspace as active without a tenant document", async () => {
    assert.equal(SYSTEM_TENANT_ID, "system");
    assert.equal(await isTenantActive(SYSTEM_TENANT_ID), true);
  });
});
