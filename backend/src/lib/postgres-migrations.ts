import { createHash } from "node:crypto";

export type SqlMigration = {
  filename: string;
  sql: string;
  transactional?: boolean;
};

type QueryResultLike<T = Record<string, unknown>> = {
  rows: T[];
  rowCount?: number | null;
};

export type MigrationClient = {
  query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<QueryResultLike<T>>;
};

const MIGRATION_LOCK_NAME = "remote_screen_schema_migrations";

export function migrationChecksum(sql: string): string {
  return createHash("sha256").update(sql, "utf8").digest("hex");
}

/**
 * Applies migrations under a session advisory lock. Every file is sent to
 * PostgreSQL as one script, so dollar-quoted functions and procedural blocks
 * remain intact. Each migration receives its own transaction and checksum.
 * A single-statement online operation can opt out with -- migrate:no-transaction.
 */
export async function applyPostgresMigrations(
  client: MigrationClient,
  migrations: SqlMigration[],
  log: (message: string) => void = () => undefined
): Promise<void> {
  await client.query("SELECT pg_advisory_lock(hashtext(current_database()), hashtext($1))", [MIGRATION_LOCK_NAME]);
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id BIGSERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        checksum_sha256 CHAR(64) NULL,
        duration_ms INTEGER NULL,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query("ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum_sha256 CHAR(64) NULL");
    await client.query("ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS duration_ms INTEGER NULL");

    for (const migration of migrations) {
      const checksum = migrationChecksum(migration.sql);
      const existing = await client.query<{ checksum_sha256: string | null }>(
        "SELECT checksum_sha256 FROM schema_migrations WHERE filename = $1 LIMIT 1",
        [migration.filename]
      );

      const applied = existing.rows[0];
      if (applied) {
        if (applied.checksum_sha256 && applied.checksum_sha256 !== checksum) {
          throw new Error(`MIGRATION_CHECKSUM_MISMATCH:${migration.filename}`);
        }
        if (!applied.checksum_sha256) {
          await client.query(
            "UPDATE schema_migrations SET checksum_sha256 = $2 WHERE filename = $1 AND checksum_sha256 IS NULL",
            [migration.filename, checksum]
          );
        }
        log(`[migrate] skip ${migration.filename}`);
        continue;
      }

      const startedAt = Date.now();
      const transactional =
        migration.transactional ?? !/^\s*--\s*migrate:no-transaction\s*$/im.test(migration.sql);
      if (transactional) await client.query("BEGIN");
      try {
        log(`[migrate] apply ${migration.filename}`);
        await client.query(migration.sql);
        const durationMs = Date.now() - startedAt;
        await client.query(
          "INSERT INTO schema_migrations (filename, checksum_sha256, duration_ms) VALUES ($1, $2, $3)",
          [migration.filename, checksum, durationMs]
        );
        if (transactional) await client.query("COMMIT");
        log(`[migrate] done ${migration.filename} (${durationMs}ms)`);
      } catch (error) {
        if (transactional) await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext(current_database()), hashtext($1))", [MIGRATION_LOCK_NAME]);
  }
}
