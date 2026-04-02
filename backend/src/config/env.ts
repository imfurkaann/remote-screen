import { config as loadEnv } from "dotenv";

export type Env = {
  nodeEnv: string;
  port: number;
  mongoUri: string;
  pgEnabled: boolean;
  pgHost: string;
  pgPort: number;
  pgDatabase: string;
  pgUser: string;
  pgPassword: string;
  pgPoolMax: number;
  readFromPostgresPercentage: number;
  jwtAccessSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  deviceBootstrapKey: string;
  corsOrigin: string;
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
  const defaultReadPercentage = getDefaultReadFromPostgresPercentage(nodeEnv);
  const readFromPostgresPercentageRaw = Number(process.env.READ_FROM_POSTGRES_PERCENTAGE ?? defaultReadPercentage);
  const readFromPostgresPercentage = Math.min(
    100,
    Math.max(0, Number.isFinite(readFromPostgresPercentageRaw) ? readFromPostgresPercentageRaw : 0)
  );

  return {
    nodeEnv,
    port: Number(process.env.BACKEND_PORT ?? 4000),
    mongoUri: requireEnv("MONGO_URI"),
    pgEnabled,
    pgHost: pgEnabled ? requireEnv("PG_HOST") : process.env.PG_HOST ?? "localhost",
    pgPort: Number(process.env.PG_PORT ?? 5432),
    pgDatabase: pgEnabled ? requireEnv("PG_DATABASE") : process.env.PG_DATABASE ?? "remote_screen",
    pgUser: pgEnabled ? requireEnv("PG_USER") : process.env.PG_USER ?? "postgres",
    pgPassword: pgEnabled ? requireEnv("PG_PASSWORD") : process.env.PG_PASSWORD ?? "",
    pgPoolMax: Number(process.env.PG_POOL_MAX ?? 20),
    readFromPostgresPercentage,
    jwtAccessSecret: requireEnv("JWT_ACCESS_SECRET"),
    jwtIssuer: process.env.JWT_ISSUER ?? "remote-screen",
    jwtAudience: process.env.JWT_AUDIENCE ?? "remote-screen-clients",
    deviceBootstrapKey: requireEnv("DEVICE_BOOTSTRAP_KEY"),
    corsOrigin: process.env.CORS_ORIGIN ?? "*"
  };
}
