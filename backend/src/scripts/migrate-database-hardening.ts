import type { Model } from "mongoose";

import { getEnv } from "../config/env.js";
import { connectMongo, disconnectMongo } from "../lib/mongo.js";
import { CommandModel } from "../models/command.model.js";
import { DeviceModel } from "../models/device.model.js";
import { MediaFolderModel } from "../models/media-folder.model.js";
import { MediaModel } from "../models/media.model.js";
import { PairingAuditModel } from "../models/pairing-audit.model.js";
import { PairingCodeModel } from "../models/pairing-code.model.js";
import { PlaylistModel } from "../models/playlist.model.js";
import { TelemetryModel } from "../models/telemetry.model.js";
import { TenantModel } from "../models/tenant.model.js";
import { UserModel } from "../models/user.model.js";

type DuplicateGroup = {
  _id: unknown;
  count: number;
  ids: unknown[];
};

const models: Model<any>[] = [
  TenantModel,
  UserModel,
  DeviceModel,
  MediaFolderModel,
  MediaModel,
  PlaylistModel,
  CommandModel,
  PairingCodeModel,
  PairingAuditModel,
  TelemetryModel
] as Model<any>[];

async function duplicateGroups(
  model: Model<any>,
  match: Record<string, unknown>,
  key: Record<string, unknown>
): Promise<DuplicateGroup[]> {
  return model.aggregate<DuplicateGroup>([
    { $match: match },
    { $group: { _id: key, count: { $sum: 1 }, ids: { $push: "$_id" } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 100 }
  ]);
}

async function dropIndexIfPresent(model: Model<any>, name: string): Promise<void> {
  const indexes = await model.collection.indexes();
  if (indexes.some((index) => index.name === name)) {
    await model.collection.dropIndex(name);
    console.log(`[mongo-hardening] dropped redundant index ${model.collection.name}.${name}`);
  }
}

async function run(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const repairPairingDuplicates = process.argv.includes("--repair-pairing-duplicates");
  const env = getEnv();

  await connectMongo(env.mongoUri, {
    maxPoolSize: Math.min(env.mongoMaxPoolSize ?? 100, 20),
    minPoolSize: 0,
    autoIndex: false
  });

  try {
    const [emails, hardwareIds, pairingCodes, playlistNames, mediaChecksums, tenantNames] =
      await Promise.all([
        duplicateGroups(UserModel as Model<any>, {}, { email: { $toLower: "$email" } }),
        duplicateGroups(DeviceModel as Model<any>, {}, { hardwareId: "$hardwareId" }),
        duplicateGroups(PairingCodeModel as Model<any>, { consumedAt: null }, { deviceId: "$deviceId" }),
        duplicateGroups(
          PlaylistModel as Model<any>,
          { nameKey: { $type: "string" } },
          { tenantId: "$tenantId", ownerUserId: "$ownerUserId", nameKey: "$nameKey" }
        ),
        duplicateGroups(
          MediaModel as Model<any>,
          { status: "ready" },
          {
            tenantId: "$tenantId",
            ownerUserId: "$ownerUserId",
            checksumSha256: "$checksumSha256"
          }
        ),
        duplicateGroups(
          TenantModel as Model<any>,
          { nameKey: { $type: "string" } },
          { nameKey: "$nameKey" }
        )
      ]);

    const findings = {
      duplicateEmails: emails.length,
      duplicateHardwareIds: hardwareIds.length,
      duplicateActivePairingCodes: pairingCodes.length,
      duplicatePlaylistNames: playlistNames.length,
      duplicateReadyMediaChecksums: mediaChecksums.length,
      duplicateTenantNames: tenantNames.length
    };
    console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", findings }, null, 2));

    const nonRepairableCount =
      emails.length + hardwareIds.length + playlistNames.length + mediaChecksums.length + tenantNames.length;
    if (nonRepairableCount > 0) {
      throw new Error("MONGO_INDEX_PREFLIGHT_FAILED: resolve duplicate unique keys before applying indexes");
    }

    if (pairingCodes.length > 0 && !repairPairingDuplicates) {
      throw new Error(
        "MONGO_INDEX_PREFLIGHT_FAILED: rerun with --repair-pairing-duplicates after reviewing the dry-run"
      );
    }

    if (!apply) {
      console.log("[mongo-hardening] dry-run complete; no data or index changes were made");
      return;
    }

    if (pairingCodes.length > 0) {
      const now = new Date();
      for (const group of pairingCodes) {
        const active = await PairingCodeModel.find({ _id: { $in: group.ids } })
          .sort({ createdAt: -1, _id: -1 })
          .select({ _id: 1 })
          .lean();
        const staleIds = active.slice(1).map((document) => document._id);
        if (staleIds.length > 0) {
          await PairingCodeModel.updateMany(
            { _id: { $in: staleIds }, consumedAt: null },
            { $set: { consumedAt: now } }
          );
        }
      }
    }

    for (const model of models) {
      await model.createIndexes();
      console.log(`[mongo-hardening] indexes ensured for ${model.collection.name}`);
    }

    await dropIndexIfPresent(UserModel as Model<any>, "tenantId_1_email_1");
    await dropIndexIfPresent(PairingCodeModel as Model<any>, "deviceId_1");
    await dropIndexIfPresent(PairingAuditModel as Model<any>, "eventType_1");
    console.log("[mongo-hardening] migration complete");
  } finally {
    await disconnectMongo();
  }
}

run().catch((error) => {
  console.error("[mongo-hardening] failed", error);
  process.exitCode = 1;
});
