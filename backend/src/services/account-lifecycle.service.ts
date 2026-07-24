import { databaseIdentityToUuid } from "../lib/identity.js";
import { DeviceModel } from "../models/device.model.js";
import { MediaFolderModel } from "../models/media-folder.model.js";
import { MediaModel } from "../models/media.model.js";
import { PlaylistModel } from "../models/playlist.model.js";
import { UserModel } from "../models/user.model.js";
import { getPostgresPool, isPostgresConnected } from "../lib/postgres.js";

export type OwnershipTransferResult = {
  devices: number;
  media: number;
  playlists: number;
  folders: number;
};

export const mongoIdToUuid = databaseIdentityToUuid;

export async function syncUserToPostgres(input: {
  id: string;
  tenantId: string;
  email: string;
  passwordHash: string;
  displayName: string;
  role: string;
  isActive: boolean;
}): Promise<void> {
  if (!isPostgresConnected()) return;
  const pool = getPostgresPool();
  await pool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, display_name, role, created_at, updated_at, deleted_at)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $7)
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email,
       password_hash = EXCLUDED.password_hash,
       display_name = EXCLUDED.display_name,
       role = EXCLUDED.role,
       updated_at = CURRENT_TIMESTAMP,
       deleted_at = EXCLUDED.deleted_at`,
    [
      mongoIdToUuid(input.id),
      input.tenantId,
      input.email,
      input.passwordHash,
      input.displayName,
      input.role,
      input.isActive ? null : new Date()
    ]
  );
}
async function syncPostgresOwnership(
  tenantId: string,
  sourceUserId: string,
  targetUserId: string
): Promise<void> {
  if (!isPostgresConnected()) return;

  const pool = getPostgresPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE devices
         SET paired_owner_user_id = $1::uuid, updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = $2::uuid AND paired_owner_user_id = $3::uuid AND deleted_at IS NULL`,
      [mongoIdToUuid(targetUserId), tenantId, mongoIdToUuid(sourceUserId)]
    );
    await client.query(
      `UPDATE media SET owner_user_id = $1, updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = $2::uuid AND owner_user_id = $3 AND deleted_at IS NULL`,
      [targetUserId, tenantId, sourceUserId]
    );
    await client.query(
      `UPDATE playlists SET owner_user_id = $1, updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = $2::uuid AND owner_user_id = $3 AND deleted_at IS NULL`,
      [targetUserId, tenantId, sourceUserId]
    );
    await client.query(
      `UPDATE users SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = $1::uuid AND id = $2::uuid AND deleted_at IS NULL`,
      [tenantId, mongoIdToUuid(sourceUserId)]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function deactivateUserAndTransferAssets(input: {
  tenantId: string;
  sourceUserId: string;
  targetUserId: string;
  actorUserId: string;
}): Promise<OwnershipTransferResult> {
  const { tenantId, sourceUserId, targetUserId, actorUserId } = input;
  if (sourceUserId === targetUserId) throw new Error("TRANSFER_TARGET_INVALID");

  const [source, target] = await Promise.all([
    UserModel.findOne({ _id: sourceUserId, tenantId, isActive: true }).select({ _id: 1 }).lean(),
    UserModel.findOne({ _id: targetUserId, tenantId, isActive: true }).select({ _id: 1 }).lean()
  ]);
  if (!source) throw new Error("USER_NOT_FOUND");
  if (!target) throw new Error("TRANSFER_TARGET_NOT_FOUND");

  const [sourceFolders, targetFolders] = await Promise.all([
    MediaFolderModel.find({ tenantId, ownerUserId: sourceUserId }).select({ _id: 1, name: 1 }).lean(),
    MediaFolderModel.find({ tenantId, ownerUserId: targetUserId }).select({ name: 1 }).lean()
  ]);
  const targetFolderNames = new Set(targetFolders.map((folder) => folder.name));
  if (sourceFolders.length > 0) {
    await MediaFolderModel.bulkWrite(
      sourceFolders.map((folder) => targetFolderNames.has(folder.name)
        ? { deleteOne: { filter: { _id: folder._id, tenantId, ownerUserId: sourceUserId } } }
        : { updateOne: {
            filter: { _id: folder._id, tenantId, ownerUserId: sourceUserId },
            update: { $set: { ownerUserId: targetUserId } }
          } }),
      { ordered: false }
    );
  }

  const [devices, media, playlists] = await Promise.all([
    DeviceModel.updateMany(
      { tenantId, pairedOwnerUserId: sourceUserId },
      { $set: { pairedOwnerUserId: targetUserId } }
    ),
    MediaModel.updateMany(
      { tenantId, ownerUserId: sourceUserId },
      { $set: { ownerUserId: targetUserId } }
    ),
    PlaylistModel.updateMany(
      { tenantId, ownerUserId: sourceUserId },
      { $set: { ownerUserId: targetUserId } }
    )
  ]);

  const deactivated = await UserModel.updateOne(
    { _id: sourceUserId, tenantId, isActive: true },
    {
      $set: {
        isActive: false,
        deactivatedAt: new Date(),
        deactivatedByUserId: actorUserId
      }
    }
  );
  if (deactivated.modifiedCount !== 1) throw new Error("USER_STATE_CHANGED");

  try {
    await syncPostgresOwnership(tenantId, sourceUserId, targetUserId);
  } catch (error) {
    console.error("PostgreSQL ownership shadow sync failed", error);
  }

  return {
    devices: devices.modifiedCount,
    media: media.modifiedCount,
    playlists: playlists.modifiedCount,
    folders: sourceFolders.length
  };
}