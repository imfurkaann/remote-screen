import { getEnv } from "../config/env.js";
import { connectMongo, disconnectMongo } from "../lib/mongo.js";
import { normalizeTenantName } from "../lib/account-policy.js";
import { DeviceModel } from "../models/device.model.js";
import { MediaFolderModel } from "../models/media-folder.model.js";
import { TenantModel } from "../models/tenant.model.js";
import { UserModel } from "../models/user.model.js";

async function run(): Promise<void> {
  const env = getEnv();
  await connectMongo(env.mongoUri, {
    maxPoolSize: env.mongoMaxPoolSize ?? 100,
    minPoolSize: env.mongoMinPoolSize ?? 5,
    autoIndex: false
  });

  const duplicates = await TenantModel.aggregate<{ _id: string; count: number }>([
    { $group: { _id: { $toLower: { $trim: { input: "$name" } } }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 20 }
  ]);
  if (duplicates.length > 0) {
    throw new Error(`Duplicate tenant names must be resolved before migration: ${duplicates.map((row) => row._id).join(", ")}`);
  }

  const tenants = await TenantModel.find({}).select({ name: 1 }).lean();
  if (tenants.length > 0) {
    await TenantModel.bulkWrite(
      tenants.map((tenant) => {
        const normalized = normalizeTenantName(tenant.name);
        if (!normalized) throw new Error(`Invalid tenant name: ${tenant._id}`);
        return {
          updateOne: {
            filter: { _id: tenant._id },
            update: { $set: { name: normalized.name, nameKey: normalized.nameKey } }
          }
        };
      }),
      { ordered: true }
    );
  }

  await Promise.all([
    TenantModel.createIndexes(),
    UserModel.createIndexes(),
    DeviceModel.createIndexes(),
    MediaFolderModel.createIndexes()
  ]);

  console.log(`[account-migration] normalized ${tenants.length} tenant(s) and ensured account asset indexes`);
}

run()
  .catch((error) => {
    console.error("[account-migration] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectMongo();
  });