import { connectMongo, disconnectMongo } from "../lib/mongo.js";
import { connectPostgres, disconnectPostgres, isPostgresConnected, getPostgresPool } from "../lib/postgres.js";
import { UserModel } from "../models/user.model.js";
import { TenantModel } from "../models/tenant.model.js";
import { DeviceModel } from "../models/device.model.js";
import { MediaModel } from "../models/media.model.js";
import { PlaylistModel } from "../models/playlist.model.js";
import { CommandModel } from "../models/command.model.js";
import { hashPassword } from "../lib/bcrypt.js";
import { randomUUID } from "node:crypto";
import { getEnv } from "../config/env.js";
import { assertDestructiveMaintenanceAllowed } from "../lib/maintenance-safety.js";

async function run() {
  assertDestructiveMaintenanceAllowed("clean-and-seed");
  const env = getEnv();
  await connectMongo(env.mongoUri);
  await connectPostgres(env);

  console.log("Cleaning up all screens (devices), playlists, media, and commands from MongoDB...");
  await DeviceModel.deleteMany({});
  await MediaModel.deleteMany({});
  await PlaylistModel.deleteMany({});
  await CommandModel.deleteMany({});

  if (isPostgresConnected()) {
    console.log("Cleaning up screens (devices), playlists, media, and commands from Postgres...");
    const pool = getPostgresPool();
    await pool.query("DELETE FROM commands");
    await pool.query("DELETE FROM devices");
    await pool.query("DELETE FROM playlists");
    await pool.query("DELETE FROM media");
  }

  // 1. Identify or seed Dosinia Luxury Resort
  console.log("Locating Dosinia Luxury Resort...");
  let dosiniaTenant = await TenantModel.findOne({ name: "Dosinia Luxury Resort" });
  let dosiniaId = "";
  if (!dosiniaTenant) {
    dosiniaId = randomUUID();
    dosiniaTenant = await TenantModel.create({
      _id: dosiniaId,
      name: "Dosinia Luxury Resort",
      isActive: true
    });
    console.log(`Created Dosinia Luxury Resort tenant with ID: ${dosiniaId}`);
  } else {
    dosiniaId = dosiniaTenant._id;
    console.log(`Found existing Dosinia Luxury Resort tenant with ID: ${dosiniaId}`);
  }

  // 2. Identify or seed Dosinia super user
  let dosiniaOwner = await UserModel.findOne({ email: "dosinialuxuryresort@remotescreen.dev" });
  if (!dosiniaOwner) {
    dosiniaOwner = await UserModel.create({
      tenantId: dosiniaId,
      email: "dosinialuxuryresort@remotescreen.dev",
      passwordHash: await hashPassword("dosinia123"),
      role: "tenant_owner",
      displayName: "Dosinia Super User",
      isActive: true
    });
    console.log(`Created Dosinia user: dosinialuxuryresort@remotescreen.dev`);
  } else {
    console.log(`Found existing Dosinia user: ${dosiniaOwner.email}`);
  }

  // 3. Clear all other tenants and users in MongoDB
  console.log("Cleaning other tenants and users from MongoDB...");
  const usersCleaned = await UserModel.deleteMany({ tenantId: { $ne: dosiniaId } });
  const tenantsCleaned = await TenantModel.deleteMany({ _id: { $ne: dosiniaId } });
  console.log(`Deleted ${usersCleaned.deletedCount} old users and ${tenantsCleaned.deletedCount} old tenants from MongoDB.`);

  // 4. Clear all other tenants and users in Postgres and keep Dosinia in sync
  if (isPostgresConnected()) {
    console.log("Cleaning other tenants and users from Postgres...");
    const pool = getPostgresPool();
    await pool.query("DELETE FROM users WHERE tenant_id != $1::uuid", [dosiniaId]);
    await pool.query("DELETE FROM tenants WHERE id != $1::uuid", [dosiniaId]);

    // Check/insert Dosinia tenant in Postgres
    const pgTenantRes = await pool.query("SELECT id FROM tenants WHERE id = $1::uuid", [dosiniaId]);
    if (pgTenantRes.rowCount === 0) {
      await pool.query(
        `INSERT INTO tenants (id, name, created_at, updated_at) VALUES ($1::uuid, $2, NOW(), NOW())`,
        [dosiniaId, "Dosinia Luxury Resort"]
      );
    }

    // Check/insert Dosinia owner user in Postgres
    const hex32 = "00000000" + dosiniaOwner._id.toString();
    const userUuid = `${hex32.substring(0, 8)}-${hex32.substring(8, 12)}-${hex32.substring(12, 16)}-${hex32.substring(16, 20)}-${hex32.substring(20)}`;
    const pgUserRes = await pool.query("SELECT id FROM users WHERE id = $1::uuid", [userUuid]);
    if (pgUserRes.rowCount === 0) {
      await pool.query(
        `INSERT INTO users (id, tenant_id, email, password_hash, display_name, role, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, NOW(), NOW())`,
        [
          userUuid,
          dosiniaId,
          dosiniaOwner.email,
          dosiniaOwner.passwordHash,
          dosiniaOwner.displayName,
          dosiniaOwner.role
        ]
      );
    }
  }

  // 5. Create new second tenant: Sheraton Hotel & Resort
  const newTenantId = randomUUID();
  const newTenantName = "Sheraton Hotel & Resort";
  const newTenantEmail = "sheraton@remotescreen.dev";
  const newTenantPassword = "sheraton123";

  console.log(`Seeding second Tenant "${newTenantName}" with ID: ${newTenantId}`);
  await TenantModel.create({
    _id: newTenantId,
    name: newTenantName,
    isActive: true
  });

  const newTenantUser = await UserModel.create({
    tenantId: newTenantId,
    email: newTenantEmail,
    passwordHash: await hashPassword(newTenantPassword),
    role: "tenant_owner",
    displayName: "Sheraton Super User",
    isActive: true
  });
  console.log(`Seeding Tenant Owner "${newTenantEmail}" with password "${newTenantPassword}"`);

  if (isPostgresConnected()) {
    console.log("Seeding Postgres shadow tables for Sheraton...");
    const pool = getPostgresPool();
    await pool.query(
      `INSERT INTO tenants (id, name, created_at, updated_at) VALUES ($1::uuid, $2, NOW(), NOW())`,
      [newTenantId, newTenantName]
    );

    const hex32 = "00000000" + newTenantUser._id.toString();
    const userUuid = `${hex32.substring(0, 8)}-${hex32.substring(8, 12)}-${hex32.substring(12, 16)}-${hex32.substring(16, 20)}-${hex32.substring(20)}`;

    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, display_name, role, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, NOW(), NOW())`,
      [
        userUuid,
        newTenantId,
        newTenantUser.email,
        newTenantUser.passwordHash,
        newTenantUser.displayName,
        newTenantUser.role
      ]
    );
  }

  await disconnectMongo();
  await disconnectPostgres();
  console.log("Cleanup and seed completed successfully!");
}

run().catch(console.error);
