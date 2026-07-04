import cors from "cors";
import express from "express";
import path from "node:path";

import type { Env } from "./config/env.js";
import {
  attachCorrelationId,
  globalErrorHandler,
  normalizeErrorResponses,
  notFoundHandler,
  requestLogging
} from "./middlewares/observability.js";
import { requireObjectJsonBody } from "./middlewares/validation.js";
import { buildAuthRouter } from "./routes/auth.route.js";
import { buildCommandRouter } from "./routes/command.route.js";
import { buildContentRouter } from "./routes/content.route.js";
import { buildHealthRouter } from "./routes/health.route.js";
import { buildOpsRouter } from "./routes/ops.route.js";
import { buildPairingRouter } from "./routes/pairing.route.js";
import { buildTelemetryRouter } from "./routes/telemetry.route.js";
import { buildAppsRouter } from "./routes/apps.route.js";
import { buildSuperRouter } from "./routes/super.route.js";

export function buildApp(env: Env) {
  const app = express();

  app.use(
    cors({
      origin: env.corsOrigin === "*" ? true : env.corsOrigin,
      credentials: true
    })
  );
  app.use(express.json());
  app.use("/api/v1", requireObjectJsonBody({ skipPaths: ["/api/v1/content/media/upload"] }));
  app.use(attachCorrelationId);
  app.use(normalizeErrorResponses);
  app.use(requestLogging);
  app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

  app.use("/api/v1", buildHealthRouter());
  app.use(
    "/api/v1/auth",
    buildAuthRouter({
      jwtSecret: env.jwtAccessSecret,
      jwtIssuer: env.jwtIssuer,
      jwtAudience: env.jwtAudience
    })
  );
  app.use(
    "/api/v1/content",
    buildContentRouter({
      jwtSecret: env.jwtAccessSecret,
      jwtIssuer: env.jwtIssuer,
      jwtAudience: env.jwtAudience,
      readFromPostgresPercentage: env.readFromPostgresPercentage
    })
  );
  app.use(
    "/api/v1/commands",
    buildCommandRouter({
      jwtSecret: env.jwtAccessSecret,
      jwtIssuer: env.jwtIssuer,
      jwtAudience: env.jwtAudience,
      readFromPostgresPercentage: env.readFromPostgresPercentage
    })
  );
  app.use(
    "/api/v1",
    buildTelemetryRouter({
      jwtSecret: env.jwtAccessSecret,
      jwtIssuer: env.jwtIssuer,
      jwtAudience: env.jwtAudience
    })
  );
  app.use(
    "/api/v1/ops",
    buildOpsRouter({
      jwtSecret: env.jwtAccessSecret,
      jwtIssuer: env.jwtIssuer,
      jwtAudience: env.jwtAudience
    })
  );
  app.use(
    "/api/v1/pairing",
    buildPairingRouter({
      jwtSecret: env.jwtAccessSecret,
      jwtIssuer: env.jwtIssuer,
      jwtAudience: env.jwtAudience,
      bootstrapKey: env.deviceBootstrapKey
    })
  );
  app.use(
    "/api/v1/apps",
    buildAppsRouter({
      jwtSecret: env.jwtAccessSecret,
      jwtIssuer: env.jwtIssuer,
      jwtAudience: env.jwtAudience
    })
  );

  app.use(
    "/api/v1/super",
    buildSuperRouter({
      jwtSecret: env.jwtAccessSecret,
      jwtIssuer: env.jwtIssuer,
      jwtAudience: env.jwtAudience
    })
  );

  app.use(notFoundHandler);
  app.use(globalErrorHandler);

  return app;
}
