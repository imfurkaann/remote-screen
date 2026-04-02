import { Pool } from "pg";

import type { Env } from "../config/env.js";

let pool: Pool | null = null;

export async function connectPostgres(env: Env): Promise<void> {
  if (!env.pgEnabled) {
    return;
  }

  if (pool) {
    return;
  }

  pool = new Pool({
    host: env.pgHost,
    port: env.pgPort,
    database: env.pgDatabase,
    user: env.pgUser,
    password: env.pgPassword,
    max: env.pgPoolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000
  });

  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
  } finally {
    client.release();
  }
}

export function getPostgresPool(): Pool {
  if (!pool) {
    throw new Error("PostgreSQL pool is not initialized");
  }
  return pool;
}

export async function disconnectPostgres(): Promise<void> {
  if (!pool) {
    return;
  }
  await pool.end();
  pool = null;
}

export function isPostgresConnected(): boolean {
  return pool !== null;
}
