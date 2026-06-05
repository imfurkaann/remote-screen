import { createServer } from "node:http";

import { buildApp } from "./app.js";
import { getEnv } from "./config/env.js";
import { connectMongo, disconnectMongo } from "./lib/mongo.js";
import { connectPostgres, disconnectPostgres } from "./lib/postgres.js";
import { createSocketServer } from "./sockets/index.js";
import { setSocketServer } from "./sockets/registry.js";

function logProcessError(type: "uncaught_exception" | "unhandled_rejection", error: unknown): void {
  const err = error instanceof Error ? error : new Error(String(error));
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "error",
      type,
      message: err.message,
      stack: err.stack ?? null
    })
  );
}

async function bootstrap(): Promise<void> {
  process.on("uncaughtException", (error) => {
    logProcessError("uncaught_exception", error);
  });

  process.on("unhandledRejection", (reason) => {
    logProcessError("unhandled_rejection", reason);
  });

  const env = getEnv();
  await connectMongo(env.mongoUri);
  await connectPostgres(env);

  if (env.pgEnabled) {
    console.log("[backend] PostgreSQL connection established");
  }

  // Reset all devices status to offline in MongoDB and PostgreSQL on server boot
  try {
    const { DeviceModel } = await import("./models/device.model.js");
    const { deviceRepository } = await import("./repositories/device.repository.js");

    await DeviceModel.updateMany({}, { $set: { status: "offline" } });
    console.log("[backend] MongoDB device statuses reset to offline");

    if (env.pgEnabled) {
      await deviceRepository.resetAllStatusesToOffline();
    }
  } catch (err) {
    console.error("[backend] Failed to reset device statuses on startup", err);
  }

  const app = buildApp(env);
  const server = createServer(app);
  const io = createSocketServer(server, { corsOrigin: env.corsOrigin });
  setSocketServer(io);

  server.listen(env.port, () => {
    console.log(`[backend] listening on :${env.port}`);
  });

  const shutdown = async () => {
    server.close(async () => {
      await disconnectMongo();
      await disconnectPostgres();
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrap().catch((error) => {
  console.error("[backend] bootstrap failed", error);
  process.exit(1);
});
