import { createServer } from "node:http";

import { buildApp } from "./app.js";
import { getEnv } from "./config/env.js";
import { connectMongo, disconnectMongo } from "./lib/mongo.js";
import { connectPostgres, disconnectPostgres } from "./lib/postgres.js";
import { closeSocketServer, createSocketServer } from "./sockets/index.js";
import { recoverPendingCommands } from "./services/command.service.js";
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
  await connectMongo(env.mongoUri, {
    maxPoolSize: env.mongoMaxPoolSize ?? 100,
    minPoolSize: env.mongoMinPoolSize ?? 5,
    autoIndex: env.mongoAutoIndex ?? env.nodeEnv !== "production",
    connectTimeoutMS: env.mongoConnectTimeoutMs,
    serverSelectionTimeoutMS: env.mongoServerSelectionTimeoutMs,
    socketTimeoutMS: env.mongoSocketTimeoutMs,
    waitQueueTimeoutMS: env.mongoWaitQueueTimeoutMs,
    heartbeatFrequencyMS: env.mongoHeartbeatFrequencyMs
  });
  await connectPostgres(env);

  if (env.pgEnabled) {
    console.log("[backend] PostgreSQL connection established");
  }

  // Database initialization is deliberately never performed during service startup.
  // Destructive development fixtures must be invoked explicitly through a maintenance script.

  const app = buildApp(env);
  const server = createServer(app);
  const io = await createSocketServer(server, {
    corsOrigin: env.corsOrigin,
    jwtSecret: env.jwtAccessSecret,
    jwtIssuer: env.jwtIssuer,
    jwtAudience: env.jwtAudience,
    redisUrl: env.redisUrl ?? null,
    nodeEnv: env.nodeEnv
  });
  setSocketServer(io);
  await recoverPendingCommands();

  server.listen(env.port, () => {
    console.log(`[backend] listening on :${env.port}`);
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[backend] ${signal} received; shutting down`);

    const forceExitTimer = setTimeout(() => {
      console.error("[backend] graceful shutdown timed out");
      process.exit(1);
    }, 10_000);
    forceExitTimer.unref();

    try {
      // Socket.IO closes active WebSocket connections and the underlying HTTP server.
      await closeSocketServer(io);
      await Promise.allSettled([disconnectMongo(), disconnectPostgres()]);
      clearTimeout(forceExitTimer);
      process.exit(0);
    } catch (error) {
      logProcessError("unhandled_rejection", error);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

bootstrap().catch((error) => {
  console.error("[backend] bootstrap failed", error);
  process.exit(1);
});
