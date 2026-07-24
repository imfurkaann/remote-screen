import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildDeviceQuery } from "./device-query.ts";

describe("buildDeviceQuery", () => {
  it("uses bounded fleet-safe defaults", () => {
    assert.equal(buildDeviceQuery().toString(), "page=1&limit=100");
  });

  it("normalizes invalid page and oversized limit", () => {
    assert.equal(buildDeviceQuery({ page: -4, limit: 500 }).toString(), "page=1&limit=200");
  });

  it("trims search and omits empty filters", () => {
    assert.equal(buildDeviceQuery({ page: 2, limit: 15, search: "  lobby  ", status: "  " }).toString(), "page=2&limit=15&search=lobby");
  });
});