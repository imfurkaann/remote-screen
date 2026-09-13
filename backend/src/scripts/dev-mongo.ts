import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { MongoMemoryServer } from "mongodb-memory-server";

// Explicit dbPath keeps local development records across process restarts.
const dbPath = fileURLToPath(new URL("../../.local-data/mongodb/", import.meta.url));
await mkdir(dbPath, { recursive: true });
const mongo = await MongoMemoryServer.create({ instance: { port: 27017, ip: "127.0.0.1", dbPath, storageEngine: "wiredTiger" } });
console.log(`Local MongoDB ready: ${mongo.getUri("remote_screen")}`);
console.log(`Persistent data: ${dbPath}`);
let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  await mongo.stop({ doCleanup: false });
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
