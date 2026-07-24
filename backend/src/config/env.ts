import { config as loadEnv } from "dotenv";

export type Env = {
  nodeEnv: string;
  port: number;
  mongoUri: string;
  mongoMaxPoolSize?: number;
  mongoMinPoolSize?: number;
  mongoAutoIndex?: boolean;
  mongoConnectTimeoutMs?: number;
  mongoServerSelectionTimeoutMs?: number;
  mongoSocketTimeoutMs?: number;
  mongoWaitQueueTimeoutMs?: number;
  mongoHeartbeatFrequencyMs?: number;
  pgEnabled: boolean;
  pgHost: string;
  pgPort: number;
  pgDatabase: string;
  pgUser: string;
  pgPassword: string;
  pgPoolMax: number;
  pgConnectionTimeoutMs?: number;
  pgIdleTimeoutMs?: number;
  pgStatementTimeoutMs?: number;
  pgIdleTransactionTimeoutMs?: number;
  pgQueryTimeoutMs?: number;
  pgMaxUses?: number;
  readFromPostgresPercentage: number;
  jwtAccessSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  deviceBootstrapKey: string;
  corsOrigin: string;
  redisUrl?: string | null;
  opsMetricsToken?: string | null;
  mediaStorageRoot?: string | undefined;
  mediaPublicBaseUrl?: string | null | undefined;
  mediaMaxFileBytes?: number | undefined;
};

// Load local env files in development workflows.
loadEnv({ path: ".env.local" });
loadEnv();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  return value === "1" || value.toLowerCase() === "true";
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}
function getDefaultReadFromPostgresPercentage(nodeEnv: string): number {
  const normalized = nodeEnv.trim().toLowerCase();
  if (normalized === "production") {
    return 10;
  }
  if (normalized === "staging") {
    return 50;
  }
  return 100;
}

export function getEnv(): Env {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const pgEnabled = parseBoolean(process.env.PG_ENABLED, false);
  const defaultReadPercentage = pgEnabled ? getDefaultReadFromPostgresPercentage(nodeEnv) : 0;
  const readFromPostgresPercentageRaw = Number(process.env.READ_FROM_POSTGRES_PERCENTAGE ?? defaultReadPercentage);
  const corsOrigin = process.env.CORS_ORIGIN ?? (nodeEnv === "production" ? "" : "*");
  if (nodeEnv === "production" && (!corsOrigin || corsOrigin === "*")) {
    throw new Error("CORS_ORIGIN must be an explicit comma-separated allowlist in production");
  }

  const readFromPostgresPercentage = Math.min(
    100,
    Math.max(0, Number.isFinite(readFromPostgresPercentageRaw) ? readFromPostgresPercentageRaw : 0)
  );

  return {
    nodeEnv,
    port: Number(process.env.BACKEND_PORT ?? 4000),
    mongoUri: requireEnv("MONGO_URI"),
    mongoMaxPoolSize: boundedInteger(process.env.MONGO_MAX_POOL_SIZE, 100, 10, 500),
    mongoMinPoolSize: boundedInteger(process.env.MONGO_MIN_POOL_SIZE, 5, 0, 50),
    mongoAutoIndex: parseBoolean(process.env.MONGO_AUTO_INDEX, nodeEnv !== "production"),
    mongoConnectTimeoutMs: boundedInteger(process.env.MONGO_CONNECT_TIMEOUT_MS, 10_000, 500, 60_000),
    mongoServerSelectionTimeoutMs: boundedInteger(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS, 10_000, 500, 60_000),
    mongoSocketTimeoutMs: boundedInteger(process.env.MONGO_SOCKET_TIMEOUT_MS, 45_000, 1_000, 300_000),
    mongoWaitQueueTimeoutMs: boundedInteger(process.env.MONGO_WAIT_QUEUE_TIMEOUT_MS, 10_000, 500, 60_000),
    mongoHeartbeatFrequencyMs: boundedInteger(process.env.MONGO_HEARTBEAT_FREQUENCY_MS, 10_000, 500, 60_000),
    pgEnabled,
    pgHost: pgEnabled ? requireEnv("PG_HOST") : process.env.PG_HOST ?? "localhost",
    pgPort: Number(process.env.PG_PORT ?? 5432),
    pgDatabase: pgEnabled ? requireEnv("PG_DATABASE") : process.env.PG_DATABASE ?? "remote_screen",
    pgUser: pgEnabled ? requireEnv("PG_USER") : process.env.PG_USER ?? "postgres",
    pgPassword: pgEnabled ? requireEnv("PG_PASSWORD") : process.env.PG_PASSWORD ?? "",
    pgPoolMax: boundedInteger(process.env.PG_POOL_MAX, 20, 1, 200),
    pgConnectionTimeoutMs: boundedInteger(process.env.PG_CONNECTION_TIMEOUT_MS, 5_000, 500, 60_000),
    pgIdleTimeoutMs: boundedInteger(process.env.PG_IDLE_TIMEOUT_MS, 30_000, 1_000, 600_000),
    pgStatementTimeoutMs: boundedInteger(process.env.PG_STATEMENT_TIMEOUT_MS, 30_000, 1_000, 300_000),
    pgIdleTransactionTimeoutMs: boundedInteger(process.env.PG_IDLE_TRANSACTION_TIMEOUT_MS, 30_000, 1_000, 300_000),
    pgQueryTimeoutMs: boundedInteger(process.env.PG_QUERY_TIMEOUT_MS, 35_000, 1_000, 310_000),
    pgMaxUses: boundedInteger(process.env.PG_MAX_USES, 7_500, 100, 100_000),
    readFromPostgresPercentage,
    jwtAccessSecret: requireEnv("JWT_ACCESS_SECRET"),
    jwtIssuer: process.env.JWT_ISSUER ?? "remote-screen",
    jwtAudience: process.env.JWT_AUDIENCE ?? "remote-screen-clients",
    deviceBootstrapKey: requireEnv("DEVICE_BOOTSTRAP_KEY"),
    corsOrigin,
    redisUrl: process.env.REDIS_URL?.trim() || null,
    opsMetricsToken: process.env.OPS_METRICS_TOKEN?.trim() || null,
    mediaStorageRoot: process.env.MEDIA_STORAGE_ROOT?.trim() || undefined,
    mediaPublicBaseUrl: process.env.MEDIA_PUBLIC_BASE_URL?.trim() || null,
    mediaMaxFileBytes: boundedInteger(process.env.MEDIA_MAX_FILE_BYTES, 500 * 1024 * 1024, 1024, 2 * 1024 * 1024 * 1024)
  };
}
