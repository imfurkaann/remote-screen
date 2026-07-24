import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isTenantUserRole,
  normalizeDisplayName,
  normalizeEmail,
  normalizeTenantName,
  parsePagination,
  validatePassword
} from "./account-policy.js";

describe("account policy", () => {
  it("normalizes account identity fields", () => {
    assert.equal(normalizeEmail("  OWNER@Example.COM "), "owner@example.com");
    assert.equal(normalizeDisplayName("  Ada    Lovelace "), "Ada Lovelace");
    assert.deepEqual(normalizeTenantName("  Acme   Media  "), { name: "Acme Media", nameKey: "acme media" });
  });

  it("rejects malformed or oversized identity values", () => {
    assert.equal(normalizeEmail("invalid"), null);
    assert.equal(normalizeDisplayName("x"), null);
    assert.equal(normalizeTenantName(" "), null);
  });

  it("accepts only tenant-scoped roles", () => {
    assert.equal(isTenantUserRole("tenant_admin"), true);
    assert.equal(isTenantUserRole("super_admin"), false);
    assert.equal(isTenantUserRole("device"), false);
  });

  it("enforces strong bounded passwords", () => {
    assert.equal(validatePassword("StrongPass123!"), "StrongPass123!");
    assert.equal(validatePassword("password123"), null);
    assert.equal(validatePassword("A".repeat(129)), null);
  });

  it("bounds pagination before queries are built", () => {
    assert.deepEqual(parsePagination(undefined, undefined), { page: 1, limit: 100, skip: 0 });
    assert.deepEqual(parsePagination("2", "50"), { page: 2, limit: 50, skip: 50 });
    assert.equal(parsePagination("0", "50"), null);
    assert.equal(parsePagination("1", "201"), null);
  });
});