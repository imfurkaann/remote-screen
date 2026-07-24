import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyPostgresMigrations, migrationChecksum, type MigrationClient } from "./postgres-migrations.js";

type RecordedQuery = { text: string; values?: unknown[] };

function fakeClient(existingChecksum: string | null | undefined = undefined) {
  const queries: RecordedQuery[] = [];
  const client: MigrationClient = {
    async query<T>(text: string, values?: unknown[]) {
      queries.push(values === undefined ? { text } : { text, values });
      if (text.startsWith("SELECT checksum_sha256")) {
        return { rows: (existingChecksum === undefined ? [] : [{ checksum_sha256: existingChecksum }]) as T[] };
      }
      return { rows: [] as T[] };
    }
  };
  return { client, queries };
}

describe("PostgreSQL migration runner", () => {
  it("executes a dollar-quoted migration as one statement and records its checksum", async () => {
    const sql = "CREATE FUNCTION demo() RETURNS void AS $$ BEGIN PERFORM 1; END; $$ LANGUAGE plpgsql;";
    const { client, queries } = fakeClient();
    await applyPostgresMigrations(client, [{ filename: "001_demo.sql", sql }]);

    assert.equal(queries.filter((query) => query.text === sql).length, 1);
    assert.ok(queries.some((query) => query.text === "BEGIN"));
    assert.ok(queries.some((query) => query.text === "COMMIT"));
    const insert = queries.find((query) => query.text.startsWith("INSERT INTO schema_migrations"));
    assert.equal(insert?.values?.[1], migrationChecksum(sql));
  });

  it("rejects a changed migration that was already applied", async () => {
    const { client, queries } = fakeClient("0".repeat(64));
    await assert.rejects(
      applyPostgresMigrations(client, [{ filename: "001_demo.sql", sql: "SELECT 1;" }]),
      /MIGRATION_CHECKSUM_MISMATCH/
    );
    assert.ok(queries.some((query) => query.text.includes("pg_advisory_unlock")));
    assert.equal(queries.some((query) => query.text === "BEGIN"), false);
  });

  it("supports one-statement online migrations outside a transaction", async () => {
    const sql =
      "-- migrate:no-transaction\nCREATE INDEX CONCURRENTLY IF NOT EXISTS idx_demo ON demo (created_at);";
    const { client, queries } = fakeClient();
    await applyPostgresMigrations(client, [{ filename: "002_online_index.sql", sql }]);

    assert.equal(queries.some((query) => query.text === "BEGIN"), false);
    assert.equal(queries.some((query) => query.text === "COMMIT"), false);
    assert.equal(queries.filter((query) => query.text === sql).length, 1);
  });});
