import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getEnv } from "../config/env.js";
import { disconnectPostgres, connectPostgres, getPostgresPool } from "../lib/postgres.js";
import { applyPostgresMigrations, type MigrationClient, type SqlMigration } from "../lib/postgres-migrations.js";

async function run(): Promise<void> {
  const env = getEnv();
  if (!env.pgEnabled) {
    throw new Error("PG_ENABLED=true olmadan migration çalıştırılamaz");
  }

  const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
  const packageRoot = path.resolve(scriptsDir, "..", "..");
  const migrationsDir = path.resolve(packageRoot, "db", "migrations");
  const files = (await readdir(migrationsDir))
    .filter((file) => /^\d+_[a-z0-9_-]+\.sql$/i.test(file))
    .sort((left, right) => left.localeCompare(right));

  if (files.length === 0) {
    throw new Error("No PostgreSQL migration files were found");
  }

  const migrations: SqlMigration[] = await Promise.all(files.map(async (filename) => ({
    filename,
    sql: await readFile(path.join(migrationsDir, filename), "utf8")
  })));

  await connectPostgres(env);
  const client = await getPostgresPool().connect();
  try {
    await applyPostgresMigrations(client as unknown as MigrationClient, migrations, console.log);
    console.log("[migrate] all migrations completed");
  } finally {
    client.release();
    await disconnectPostgres();
  }
}

run().catch((error) => {
  console.error("[migrate] failed", error);
  process.exitCode = 1;
});