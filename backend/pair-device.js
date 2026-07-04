import mongoose from 'mongoose';
import { getEnv } from './src/config/env.js';
import { TenantModel } from './src/models/tenant.model.js';
import { UserModel } from './src/models/user.model.js';
import { DeviceModel } from './src/models/device.model.js';

async function run() {
  const env = getEnv();
  await mongoose.connect(env.mongoUri);

  const tenant = await TenantModel.findOne({ name: "Dosinia Luxury Resort" });
  if (!tenant) {
    console.error("Tenant not found!");
    await mongoose.disconnect();
    return;
  }

  const user = await UserModel.findOne({ email: "dosinialuxuryresort@remotescreen.dev" });
  if (!user) {
    console.error("User not found!");
    await mongoose.disconnect();
    return;
  }

  const device = await DeviceModel.findOne({ hardwareId: "38db5e6d5dfaa6bb" });
  if (!device) {
    console.error("Device not found!");
    await mongoose.disconnect();
    return;
  }

  device.tenantId = tenant._id;
  device.pairedOwnerUserId = user._id.toString();
  device.status = "online";
  device.lastSeenAt = new Date();
  await device.save();

  console.log("Device successfully paired with Dosinia Luxury Resort using official Models!");
  console.log("Tenant ID:", tenant._id);
  console.log("User ID:", user._id);

  await mongoose.disconnect();
}

run().catch(console.error);
