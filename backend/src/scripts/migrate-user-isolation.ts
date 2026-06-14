import mongoose from "mongoose";

import { getEnv } from "../config/env.js";
import { connectMongo, disconnectMongo } from "../lib/mongo.js";
import { connectPostgres, disconnectPostgres, getPostgresPool } from "../lib/postgres.js";
import { UserModel } from "../models/user.model.js";
import { DeviceModel } from "../models/device.model.js";
import { MediaModel } from "../models/media.model.js";
import { PlaylistModel } from "../models/playlist.model.js";
import { PairingAuditModel } from "../models/pairing-audit.model.js";
import { hashPassword } from "../lib/bcrypt.js";

const VALID_USERS = [
  { email: "owner@remotescreen.dev", password: "owner123", role: "tenant_owner", displayName: "Tenant Owner" },
  { email: "admin@remotescreen.dev", password: "admin123", role: "tenant_admin", displayName: "Tenant Admin" },
  { email: "operator@remotescreen.dev", password: "operator123", role: "operator", displayName: "Operator" },
  { email: "viewer@remotescreen.dev", password: "viewer123", role: "viewer", displayName: "Viewer" }
];

function mongoIdToUuid(mongoId: string): string {
  if (!mongoId || mongoId.length !== 24) {
    if (mongoId && mongoId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      return mongoId;
    }
    return "00000000-0000-0000-0000-000000000000";
  }
  const hex32 = "00000000" + mongoId;
  return `${hex32.substring(0, 8)}-${hex32.substring(8, 12)}-${hex32.substring(12, 16)}-${hex32.substring(16, 20)}-${hex32.substring(20)}`;
}

async function run(): Promise<void> {
  console.log("[migration] Starting user isolation data migration...");
  const env = getEnv();
  
  // 1. Connect MongoDB
  await connectMongo(env.mongoUri);
  console.log("[migration] Connected to MongoDB.");

  // 2. Ensure bootstrap users exist in MongoDB
  const userMap: Record<string, string> = {}; // role -> ObjectId string
  const emailToIdMap: Record<string, string> = {}; // email -> ObjectId string
  
  for (const user of VALID_USERS) {
    let dbUser = await UserModel.findOne({ email: user.email });
    if (!dbUser) {
      const passwordHash = await hashPassword(user.password);
      dbUser = await UserModel.create({
        tenantId: "tenant-demo",
        email: user.email,
        passwordHash,
        role: user.role as any,
        displayName: user.displayName,
        isActive: true
      });
      console.log(`[migration] Created user: ${user.email} with ID: ${dbUser._id}`);
    } else {
      console.log(`[migration] User already exists: ${user.email} with ID: ${dbUser._id}`);
    }
    
    if (dbUser) {
      const dbUserId = (dbUser as any)._id ?? dbUser.id;
      userMap[user.role] = String(dbUserId);
      emailToIdMap[user.email] = String(dbUserId);
    }
  }

  const ownerUserId = userMap["tenant_owner"] || "";
  console.log(`[migration] Resolved default ownerUserId (tenant_owner): ${ownerUserId}`);

  // Map of legacy string user IDs to new MongoDB ObjectIds
  const idReplacementMap: Record<string, string> = {
    "user-tenant_owner": userMap["tenant_owner"] || "",
    "user-tenant_admin": userMap["tenant_admin"] || "",
    "user-operator": userMap["operator"] || "",
    "user-viewer": userMap["viewer"] || ""
  };

  // 3. Migrate MongoDB Devices
  let devicesMigrated = 0;
  const devices = await DeviceModel.find({});
  for (const device of devices) {
    let updated = false;
    const oldPairedOwner = device.pairedOwnerUserId;
    
    if (oldPairedOwner) {
      const replacement = idReplacementMap[oldPairedOwner];
      if (replacement) {
        device.pairedOwnerUserId = replacement;
        updated = true;
      } else if (!mongoose.Types.ObjectId.isValid(oldPairedOwner)) {
        device.pairedOwnerUserId = ownerUserId;
        updated = true;
      }
    }
    
    if (updated) {
      await device.save();
      devicesMigrated++;
      console.log(`[migration] Device ${device.hardwareId} pairedOwnerUserId migrated from "${oldPairedOwner}" to "${device.pairedOwnerUserId}"`);
    }
  }
  console.log(`[migration] Migrated ${devicesMigrated} MongoDB devices.`);

  // 4. Migrate MongoDB Media
  let mediaMigrated = 0;
  const mediaList = await MediaModel.find({});
  for (const media of mediaList) {
    let updated = false;
    const oldOwner = media.ownerUserId;
    
    if (!oldOwner || (typeof oldOwner === "string" && idReplacementMap[oldOwner]) || (typeof oldOwner === "string" && !mongoose.Types.ObjectId.isValid(oldOwner))) {
      media.ownerUserId = typeof oldOwner === "string" && idReplacementMap[oldOwner] ? idReplacementMap[oldOwner] : ownerUserId;
      updated = true;
    }
    
    if (updated) {
      await media.save();
      mediaMigrated++;
    }
  }
  console.log(`[migration] Migrated ${mediaMigrated} MongoDB media documents.`);

  // 5. Migrate MongoDB Playlists
  let playlistsMigrated = 0;
  const playlists = await PlaylistModel.find({});
  for (const playlist of playlists) {
    let updated = false;
    const oldOwner = playlist.ownerUserId;
    
    if (!oldOwner || (typeof oldOwner === "string" && idReplacementMap[oldOwner]) || (typeof oldOwner === "string" && !mongoose.Types.ObjectId.isValid(oldOwner))) {
      playlist.ownerUserId = typeof oldOwner === "string" && idReplacementMap[oldOwner] ? idReplacementMap[oldOwner] : ownerUserId;
      updated = true;
    }
    
    if (updated) {
      await playlist.save();
      playlistsMigrated++;
    }
  }
  console.log(`[migration] Migrated ${playlistsMigrated} MongoDB playlists.`);

  // 6. Migrate MongoDB Pairing Audit logs
  let auditsMigrated = 0;
  const audits = await PairingAuditModel.find({});
  for (const audit of audits) {
    let updated = false;
    const oldActorId = audit.actorId;
    if (oldActorId && idReplacementMap[oldActorId]) {
      audit.actorId = idReplacementMap[oldActorId];
      updated = true;
    }
    
    if (updated) {
      await audit.save();
      auditsMigrated++;
    }
  }
  console.log(`[migration] Migrated ${auditsMigrated} MongoDB pairing audits.`);

  // 7. Migrate PostgreSQL if enabled
  if (env.pgEnabled) {
    await connectPostgres(env);
    console.log("[migration] Connected to PostgreSQL.");
    const pool = getPostgresPool();
    const client = await pool.connect();
    
    try {
      await client.query("BEGIN");
      
      const demoTenantUuid = 'd3b07384-d113-4956-a5e2-e1c7edd47b97';
      
      await client.query(
        `INSERT INTO tenants (id, name, plan)
         VALUES ($1::uuid, 'Demo Tenant', 'SMB')
         ON CONFLICT (id) DO NOTHING`,
        [demoTenantUuid]
      );
      console.log(`[migration] Ensured demo tenant exists in PostgreSQL.`);

      // Seed users in PostgreSQL
      for (const user of VALID_USERS) {
        const mongoId = emailToIdMap[user.email] || "";
        const pgUserUuid = mongoIdToUuid(mongoId);
        const passwordHash = await hashPassword(user.password);
        
        await client.query(
          `INSERT INTO users (id, tenant_id, email, password_hash, display_name, role)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)
           ON CONFLICT (id) DO NOTHING`,
          [
            pgUserUuid,
            demoTenantUuid,
            user.email,
            passwordHash,
            user.displayName,
            user.role
          ]
        );
      }
      console.log(`[migration] Ensured bootstrap users exist in PostgreSQL.`);

      // Update devices in PostgreSQL
      const pgOwnerUuid = mongoIdToUuid(ownerUserId);
      const devicesPg = await client.query(
        `UPDATE devices
         SET tenant_id = $1::uuid,
             paired_owner_user_id = $2::uuid
         WHERE tenant_id::text = 'tenant-demo' OR paired_owner_user_id IS NULL`,
        [demoTenantUuid, pgOwnerUuid]
      );
      console.log(`[migration] Updated ${devicesPg.rowCount ?? 0} devices in PostgreSQL.`);

      // Update PostgreSQL shadow media and playlists
      const mediaPg = await client.query(
        `UPDATE media
         SET tenant_id = $1::uuid,
             owner_user_id = $2
         WHERE tenant_id::text = 'tenant-demo' OR owner_user_id IS NULL`,
        [demoTenantUuid, ownerUserId]
      );
      console.log(`[migration] Updated ${mediaPg.rowCount ?? 0} media rows in PostgreSQL.`);

      const playlistsPg = await client.query(
        `UPDATE playlists
         SET tenant_id = $1::uuid,
             owner_user_id = $2
         WHERE tenant_id::text = 'tenant-demo' OR owner_user_id IS NULL`,
        [demoTenantUuid, ownerUserId]
      );
      console.log(`[migration] Updated ${playlistsPg.rowCount ?? 0} playlist rows in PostgreSQL.`);

      await client.query("COMMIT");
      console.log("[migration] PostgreSQL data migration committed successfully.");
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("[migration] PostgreSQL transaction rolled back due to error:", err);
      throw err;
    } finally {
      client.release();
      await disconnectPostgres();
    }
  } else {
    console.log("[migration] PostgreSQL is disabled, skipping PostgreSQL migration.");
  }

  // 8. Disconnect MongoDB
  await disconnectMongo();
  console.log("[migration] MongoDB disconnected.");
  console.log("[migration] User isolation data migration completed successfully!");
}

run().catch((error) => {
  console.error("[migration] Migration failed:", error);
  process.exit(1);
});
