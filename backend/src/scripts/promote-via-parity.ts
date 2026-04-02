import { getEnv } from "../config/env.js";
import { connectMongo, disconnectMongo } from "../lib/mongo.js";
import { connectPostgres, disconnectPostgres, getPostgresPool } from "../lib/postgres.js";
import { MediaModel } from "../models/media.model.js";
import { PlaylistModel } from "../models/playlist.model.js";

function requireTenantId(): string {
  const tenantId = process.env.CHECK_TENANT_ID;
  if (!tenantId) {
    throw new Error("CHECK_TENANT_ID env var is required");
  }
  return tenantId;
}

function getSourceEnvironment(): string {
  const env = (process.env.SOURCE_ENV ?? "staging").trim().toLowerCase();
  if (!["dev", "development", "staging", "prod", "production"].includes(env)) {
    throw new Error("SOURCE_ENV must be: dev, development, staging, prod, or production");
  }
  return env;
}

function getTargetEnvironment(): string {
  const env = (process.env.TARGET_ENV ?? "prod").trim().toLowerCase();
  if (!["dev", "development", "staging", "prod", "production"].includes(env)) {
    throw new Error("TARGET_ENV must be: dev, development, staging, prod, or production");
  }
  return env;
}

function getSampleLimit(): number {
  const raw = Number(process.env.CHECK_SAMPLE_LIMIT ?? 100);
  return Math.min(Math.max(Number.isFinite(raw) ? raw : 100, 10), 500);
}

function pickPayloadStatus(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const source = payload as Record<string, unknown>;
  const raw = source.status ?? source.result ?? source.outcome ?? source.state;
  if (typeof raw !== "string") {
    return null;
  }

  return raw.trim().toLowerCase();
}

function isFailureStatus(status: string | null): boolean {
  if (!status) {
    return false;
  }

  return ["failed", "failure", "error", "timeout", "checksum_failed", "download_failed"].includes(status);
}

async function run(): Promise<void> {
  const env = getEnv();
  const tenantId = requireTenantId();
  const sourceEnv = getSourceEnvironment();
  const targetEnv = getTargetEnvironment();
  const sampleLimit = getSampleLimit();

  if (!env.pgEnabled) {
    throw new Error("PG_ENABLED=true is required");
  }

  // Normalize environment names for comparison
  const normalizeEnv = (e: string) => (e === "production" ? "prod" : e === "development" ? "dev" : e);
  const sourceNorm = normalizeEnv(sourceEnv);
  const targetNorm = normalizeEnv(targetEnv);

  // Validate promotion path (can only promote forward: dev -> staging -> prod)
  const envOrder = ["dev", "staging", "prod"];
  const sourceIdx = envOrder.indexOf(sourceNorm);
  const targetIdx = envOrder.indexOf(targetNorm);

  if (sourceIdx === -1 || targetIdx === -1) {
    throw new Error(`Invalid environment mapping: source=${sourceNorm}, target=${targetNorm}`);
  }

  if (targetIdx <= sourceIdx) {
    throw new Error(`Invalid promotion path: cannot promote from ${sourceNorm} to ${targetNorm} (must move forward)`);
  }

  await connectMongo(env.mongoUri);
  await connectPostgres(env);

  const [mongoMediaCount, mongoPlaylistCount] = await Promise.all([
    MediaModel.countDocuments({ tenantId }),
    PlaylistModel.countDocuments({ tenantId })
  ]);

  const pool = getPostgresPool();
  const [pgMediaCountRes, pgPlaylistCountRes] = await Promise.all([
    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM media WHERE tenant_id = $1::uuid AND deleted_at IS NULL`,
      [tenantId]
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM playlists WHERE tenant_id = $1::uuid AND deleted_at IS NULL`,
      [tenantId]
    )
  ]);

  const pgMediaCount = Number(pgMediaCountRes.rows[0]?.count ?? 0);
  const pgPlaylistCount = Number(pgPlaylistCountRes.rows[0]?.count ?? 0);

  const [mongoMedia, mongoPlaylists, pgMediaRows, pgPlaylistRows] = await Promise.all([
    MediaModel.find({ tenantId }).sort({ updatedAt: -1 }).limit(sampleLimit).lean(),
    PlaylistModel.find({ tenantId }).sort({ updatedAt: -1 }).limit(sampleLimit).lean(),
    pool.query<{ external_id: string; checksum_sha256: string; status: string }>(
      `SELECT external_id, checksum_sha256, status
       FROM media
       WHERE tenant_id = $1::uuid AND deleted_at IS NULL
       ORDER BY updated_at DESC
       LIMIT $2`,
      [tenantId, sampleLimit]
    ),
    pool.query<{ external_id: string; version: number; item_count: number }>(
      `SELECT external_id, version, jsonb_array_length(items_json) AS item_count
       FROM playlists
       WHERE tenant_id = $1::uuid AND deleted_at IS NULL
       ORDER BY updated_at DESC
       LIMIT $2`,
      [tenantId, sampleLimit]
    )
  ]);

  const pgMediaByExternalId = new Map(pgMediaRows.rows.map((item) => [item.external_id, item]));
  const pgPlaylistByExternalId = new Map(pgPlaylistRows.rows.map((item) => [item.external_id, item]));

  const mediaMismatchCount = mongoMedia.filter((mongo) => {
    const externalId = String((mongo as { _id: unknown })._id);
    const pg = pgMediaByExternalId.get(externalId);
    return !pg || pg.checksum_sha256 !== mongo.checksumSha256 || pg.status !== mongo.status;
  }).length;

  const playlistMismatchCount = mongoPlaylists.filter((mongo) => {
    const externalId = String((mongo as { _id: unknown })._id);
    const pg = pgPlaylistByExternalId.get(externalId);
    return !pg || pg.version !== mongo.version || pg.item_count !== mongo.items.length;
  }).length;

  const parityOk =
    mongoMediaCount === pgMediaCount &&
    mongoPlaylistCount === pgPlaylistCount &&
    mediaMismatchCount === 0 &&
    playlistMismatchCount === 0;

  const canPromote = parityOk;

  const report = {
    tenant_id: tenantId,
    as_of: new Date().toISOString(),
    promotion: {
      source_env: sourceNorm,
      target_env: targetNorm,
      can_promote: canPromote,
      reason: canPromote ? "parity verification passed" : "parity verification failed"
    },
    parity: {
      ok: parityOk,
      counts: {
        media: {
          mongo: mongoMediaCount,
          postgres: pgMediaCount,
          match: mongoMediaCount === pgMediaCount
        },
        playlists: {
          mongo: mongoPlaylistCount,
          postgres: pgPlaylistCount,
          match: mongoPlaylistCount === pgPlaylistCount
        }
      },
      sample_verification: {
        media_sample_size: mongoMedia.length,
        media_mismatches: mediaMismatchCount,
        playlists_sample_size: mongoPlaylists.length,
        playlists_mismatches: playlistMismatchCount
      }
    },
    inputs: {
      sample_limit: sampleLimit
    }
  };

  console.log(JSON.stringify(report, null, 2));

  if (!canPromote) {
    process.exitCode = 1;
  }

  await disconnectMongo();
  await disconnectPostgres();
}

run().catch(async (error) => {
  console.error("[promote-via-parity] failed", error);
  try {
    await disconnectMongo();
  } catch {
    // ignore
  }
  try {
    await disconnectPostgres();
  } catch {
    // ignore
  }
  process.exitCode = 1;
});
