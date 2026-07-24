import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertDestructiveMaintenanceAllowed } from "./maintenance-safety.js";

describe("destructive database maintenance guard", () => {
  it("blocks production even with confirmations", () => {
    assert.throws(
      () =>
        assertDestructiveMaintenanceAllowed("clear", {
          NODE_ENV: "production",
          ALLOW_DESTRUCTIVE_DB_MAINTENANCE: "true",
          DESTRUCTIVE_DB_CONFIRM: "remote_screen-delete-data"
        }),
      /cannot run in production/
    );
  });

  it("requires both explicit confirmations", () => {
    assert.throws(
      () => assertDestructiveMaintenanceAllowed("clear", { NODE_ENV: "development" }),
      /ALLOW_DESTRUCTIVE_DB_MAINTENANCE/
    );
    assert.throws(
      () =>
        assertDestructiveMaintenanceAllowed("clear", {
          NODE_ENV: "development",
          ALLOW_DESTRUCTIVE_DB_MAINTENANCE: "true"
        }),
      /DESTRUCTIVE_DB_CONFIRM/
    );
  });

  it("allows an explicitly confirmed non-production operation", () => {
    assert.doesNotThrow(() =>
      assertDestructiveMaintenanceAllowed("clear", {
        NODE_ENV: "test",
        ALLOW_DESTRUCTIVE_DB_MAINTENANCE: "true",
        DESTRUCTIVE_DB_CONFIRM: "remote_screen-delete-data"
      })
    );
  });
});
