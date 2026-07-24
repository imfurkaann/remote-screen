import { Pool } from "pg";

import type { Env } from "../config/env.js";

let pool: Pool | null = null;
let connectionAttempt: Promise<void> | null = null;

async function initializePool(env: Env): Promise<void> {
  const candidate = new Pool({
    host: env.pgHost,
    port: env.pgPort,
    database: env.pgDatabase,
    user: env.pgUser,
    password: env.pgPassword,
    max: env.pgPoolMax,
    idleTimeoutMillis: env.pgIdleTimeoutMs ?? 30_000,
    connectionTimeoutMillis: env.pgConnectionTimeoutMs ?? 5_000,
    statement_timeout: env.pgStatementTimeoutMs ?? 30_000,
    idle_in_transaction_session_timeout: env.pgIdleTransactionTimeoutMs ?? 30_000,
    query_timeout: env.pgQueryTimeoutMs ?? 35_000,
    maxUses: env.pgMaxUses ?? 7_500,
    application_name: `remote-screen-backend-${env.nodeEnv}`,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000
  });

  candidate.on("error", (error) => {
    console.error("[postgres] idle pool client error", error);
  });

  try {
    const client = await candidate.connect();
    try {
      await client.query("SELECT 1");
    } finally {
      client.release();
    }
    pool = candidate;
  } catch (error) {
    await candidate.end().catch(() => undefined);
    throw error;
  }
}

export async function connectPostgres(env: Env): Promise<void> {
  if (!env.pgEnabled || pool) return;
  if (connectionAttempt) return connectionAttempt;

  connectionAttempt = initializePool(env);
  try {
    await connectionAttempt;
  } finally {
    connectionAttempt = null;
  }
}

export function getPostgresPool(): Pool {
  if (!pool) {
    throw new Error("PostgreSQL pool is not initialized");
  }
  return pool;
}

export async function disconnectPostgres(): Promise<void> {
  if (connectionAttempt) {
    await connectionAttempt.catch(() => undefined);
  }
  const activePool = pool;
  pool = null;
  if (activePool) await activePool.end();
}

export function isPostgresConnected(): boolean {
  return pool !== null;
}

export function getPostgresPoolDiagnostics(): {
  initialized: boolean;
  total: number;
  idle: number;
  waiting: number;
} {
  return {
    initialized: pool !== null,
    total: pool?.totalCount ?? 0,
    idle: pool?.idleCount ?? 0,
    waiting: pool?.waitingCount ?? 0
  };
}