import { getEnv } from "../config/env.js";
import { connectMongo, disconnectMongo } from "../lib/mongo.js";
import { connectPostgres, disconnectPostgres, getPostgresPool, isPostgresConnected } from "../lib/postgres.js";
import { DeviceModel } from "../models/device.model.js";
import { MediaModel } from "../models/media.model.js";
import { PairingCodeModel } from "../models/pairing-code.model.js";
import { PlaylistModel } from "../models/playlist.model.js";
import { UserModel } from "../models/user.model.js";

type IntegrityFinding = {
  check: string;
  count: number;
  severity: "critical" | "warning";
};

async function countDuplicateGroups(
  collection: { aggregate: (pipeline: Record<string, unknown>[]) => { toArray: () => Promise<unknown[]> } },
  match: Record<string, unknown>,
  key: Record<string, unknown>
): Promise<number> {
  const result = (await collection
    .aggregate([
      { $match: match },
      { $group: { _id: key, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $count: "count" }
    ])
    .toArray()) as Array<{ count?: number }>;
  return result[0]?.count ?? 0;
}

async function mongoFindings(): Promise<IntegrityFinding[]> {
  const [
    duplicateEmails,
    duplicateHardwareIds,
    duplicatePairingCodes,
    activePairingCodesWithoutCredential,
    stalePairingCodeClaims,
    orphanUserTenants,
    orphanDeviceTenants,
    orphanDeviceOwners,
    orphanDevicePlaylists,
    orphanPlaylistTenants,
    orphanPlaylistOwners,
    orphanPlaylistMedia
  ] = await Promise.all([
    countDuplicateGroups(UserModel.collection, {}, { email: { $toLower: "$email" } }),
    countDuplicateGroups(DeviceModel.collection, {}, { hardwareId: "$hardwareId" }),
    countDuplicateGroups(PairingCodeModel.collection, { consumedAt: null }, { deviceId: "$deviceId" }),
    PairingCodeModel.countDocuments({
      consumedAt: null,
      expiresAt: { $gt: new Date() },
      $or: [
        { deviceCredentialHash: { $exists: false } },
        { deviceCredentialHash: null },
        { deviceCredentialHash: { $not: /^[a-f0-9]{64}$/i } }
      ]
    }),
    PairingCodeModel.countDocuments({
      consumedAt: null,
      claimedAt: { $lt: new Date(Date.now() - 60_000) }
    }),
    UserModel.aggregate<{ count: number }>([
      { $lookup: { from: "tenants", localField: "tenantId", foreignField: "_id", as: "tenant" } },
      { $match: { tenant: { $size: 0 } } },
      { $count: "count" }
    ]).then((rows) => rows[0]?.count ?? 0),
    DeviceModel.aggregate<{ count: number }>([
      { $match: { tenantId: { $ne: null } } },
      { $lookup: { from: "tenants", localField: "tenantId", foreignField: "_id", as: "tenant" } },
      { $match: { tenant: { $size: 0 } } },
      { $count: "count" }
    ]).then((rows) => rows[0]?.count ?? 0),
    DeviceModel.aggregate<{ count: number }>([
      { $match: { pairedOwnerUserId: { $ne: null } } },
      { $lookup: { from: "users", localField: "pairedOwnerUserId", foreignField: "_id", as: "owner" } },
      { $match: { owner: { $size: 0 } } },
      { $count: "count" }
    ]).then((rows) => rows[0]?.count ?? 0),
    DeviceModel.aggregate<{ count: number }>([
      { $match: { currentPlaylistId: { $ne: null } } },
      { $lookup: { from: "playlists", localField: "currentPlaylistId", foreignField: "_id", as: "playlist" } },
      { $match: { playlist: { $size: 0 } } },
      { $count: "count" }
    ]).then((rows) => rows[0]?.count ?? 0),
    PlaylistModel.aggregate<{ count: number }>([
      { $lookup: { from: "tenants", localField: "tenantId", foreignField: "_id", as: "tenant" } },
      { $match: { tenant: { $size: 0 } } },
      { $count: "count" }
    ]).then((rows) => rows[0]?.count ?? 0),
    PlaylistModel.aggregate<{ count: number }>([
      { $match: { ownerUserId: { $ne: null } } },
      { $lookup: { from: "users", localField: "ownerUserId", foreignField: "_id", as: "owner" } },
      { $match: { owner: { $size: 0 } } },
      { $count: "count" }
    ]).then((rows) => rows[0]?.count ?? 0),
    PlaylistModel.aggregate<{ count: number }>([
      { $unwind: "$items" },
      { $lookup: { from: "media", localField: "items.mediaId", foreignField: "_id", as: "mediaDocument" } },
      { $match: { mediaDocument: { $size: 0 } } },
      { $count: "count" }
    ]).then((rows) => rows[0]?.count ?? 0)
  ]);

  return [
    { check: "mongo.duplicate_user_email", count: duplicateEmails, severity: "critical" },
    { check: "mongo.duplicate_device_hardware_id", count: duplicateHardwareIds, severity: "critical" },
    { check: "mongo.multiple_active_pairing_codes", count: duplicatePairingCodes, severity: "critical" },
    { check: "mongo.active_pairing_code_without_credential", count: activePairingCodesWithoutCredential, severity: "critical" },
    { check: "mongo.stale_pairing_code_claim", count: stalePairingCodeClaims, severity: "warning" },
    { check: "mongo.orphan_user_tenant", count: orphanUserTenants, severity: "critical" },
    { check: "mongo.orphan_device_tenant", count: orphanDeviceTenants, severity: "critical" },
    { check: "mongo.orphan_device_owner", count: orphanDeviceOwners, severity: "critical" },
    { check: "mongo.orphan_device_playlist", count: orphanDevicePlaylists, severity: "warning" },
    { check: "mongo.orphan_playlist_tenant", count: orphanPlaylistTenants, severity: "critical" },
    { check: "mongo.orphan_playlist_owner", count: orphanPlaylistOwners, severity: "critical" },
    { check: "mongo.orphan_playlist_media_item", count: orphanPlaylistMedia, severity: "warning" }
  ];
}

async function postgresFindings(): Promise<IntegrityFinding[]> {
  if (!isPostgresConnected()) return [];
  const pool = getPostgresPool();
  const result = await pool.query<{ check_name: string; count: string }>(`
    SELECT 'postgres.unvalidated_constraints' AS check_name, COUNT(*)::text AS count
      FROM pg_constraint
     WHERE connamespace = current_schema()::regnamespace
       AND NOT convalidated
    UNION ALL
    SELECT 'postgres.orphan_device_owner', COUNT(*)::text
      FROM devices d
      LEFT JOIN users u ON u.id = d.paired_owner_user_id AND u.tenant_id = d.tenant_id
     WHERE d.deleted_at IS NULL AND d.paired_owner_user_id IS NOT NULL AND u.id IS NULL
    UNION ALL
    SELECT 'postgres.orphan_playlist_media_item', COUNT(*)::text
      FROM playlists p
     WHERE p.deleted_at IS NULL
       AND EXISTS (
         SELECT 1
           FROM jsonb_array_elements(p.items) item
           LEFT JOIN media m ON m.id::text = item->>'mediaId' AND m.deleted_at IS NULL
          WHERE m.id IS NULL
       )
  `);
  return result.rows.map((row) => ({
    check: row.check_name,
    count: Number(row.count),
    severity: row.check_name === "postgres.unvalidated_constraints" ? "warning" : "critical"
  }));
}

async function run(): Promise<void> {
  const env = getEnv();
  await connectMongo(env.mongoUri, {
    maxPoolSize: Math.min(env.mongoMaxPoolSize ?? 100, 20),
    minPoolSize: 0,
    autoIndex: false
  });

  try {
    await connectPostgres(env);
    const findings = [...(await mongoFindings()), ...(await postgresFindings())];
    const failures = findings.filter((finding) => finding.count > 0);
    console.log(
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          mode: "read-only",
          status: failures.some((finding) => finding.severity === "critical") ? "failed" : "passed",
          findings
        },
        null,
        2
      )
    );
    if (failures.some((finding) => finding.severity === "critical")) process.exitCode = 2;
  } finally {
    await Promise.allSettled([disconnectMongo(), disconnectPostgres()]);
  }
}

run().catch((error) => {
  console.error("[database-integrity] failed", error);
  process.exitCode = 1;
});
