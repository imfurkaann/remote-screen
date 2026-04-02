import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getEnv } from "../config/env.js";
import { connectPostgres, disconnectPostgres, getPostgresPool } from "../lib/postgres.js";

function splitSqlStatements(sql: string): string[] {
  return sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => `${s};`);
}

async function run(): Promise<void> {
  const env = getEnv();
  if (!env.pgEnabled) {
    throw new Error("PG_ENABLED=true olmadan migration çalıştırılamaz");
  }

  await connectPostgres(env);
  const pool = getPostgresPool();

  const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
  const packageRoot = path.resolve(scriptsDir, "..", "..");
  const migrationsDir = path.resolve(packageRoot, "db", "migrations");
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    console.log("[migrate] SQL migration dosyası bulunamadı");
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id BIGSERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    for (const file of files) {
      const already = await client.query(
        "SELECT 1 FROM schema_migrations WHERE filename = $1 LIMIT 1",
        [file]
      );
      if (already.rowCount && already.rowCount > 0) {
        console.log(`[migrate] skip ${file}`);
        continue;
      }

      const fullPath = path.join(migrationsDir, file);
      const sql = await readFile(fullPath, "utf8");
      const statements = splitSqlStatements(sql);

      console.log(`[migrate] apply ${file} (${statements.length} statement)`);
      for (const stmt of statements) {
        await client.query(stmt);
      }

      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
      console.log(`[migrate] done ${file}`);
    }

    await client.query("COMMIT");
    console.log("[migrate] all migrations completed");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await disconnectPostgres();
  }
}

run().catch((error) => {
  console.error("[migrate] failed", error);
  process.exit(1);
});
