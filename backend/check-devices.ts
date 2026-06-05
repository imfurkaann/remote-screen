import { connectMongo, disconnectMongo } from "./src/lib/mongo.js";
import { DeviceModel } from "./src/models/device.model.js";

async function run() {
  await connectMongo('mongodb://127.0.0.1:27017/remote_screen');
  const devices = await DeviceModel.find({});
  console.log("DEVICES:");
  console.log(JSON.stringify(devices, null, 2));
  await disconnectMongo();
}

run().catch(console.error);
