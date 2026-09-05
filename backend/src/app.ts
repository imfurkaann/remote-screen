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
  const allowedOrigins = env.corsOrigin.split(",").map((origin) => origin.trim()).filter(Boolean);

  if (env.nodeEnv === "production") {
    app.set("trust proxy", 1);
  }

  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (env.nodeEnv === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  });
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || env.corsOrigin === "*" || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error("Origin is not allowed"));
      },
      credentials: true
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use("/api/v1", requireObjectJsonBody({ skipPaths: ["/api/v1/content/media/upload"] }));
  app.use(attachCorrelationId);
  app.use(normalizeErrorResponses);
  app.use(requestLogging);
  // Device previews can contain sensitive on-screen information and are only
  // served through the authenticated command route.
  app.use("/uploads/screenshots", (_req, res) => {
    res.status(404).json({ code: "NOT_FOUND", message: "Not found" });
  });
  app.use("/uploads", express.static(path.resolve(env.mediaStorageRoot || path.resolve(process.cwd(), "uploads")), {
    dotfiles: "deny",
    fallthrough: false,
    immutable: true,
    maxAge: "1h",
    setHeaders(res) {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
      res.setHeader("Cross-Origin-Resource-Policy", "same-site");
    }
  }));

  app.use("/api/v1", buildHealthRouter({
    nodeEnv: env.nodeEnv,
    pgEnabled: env.pgEnabled,
    metricsToken: env.opsMetricsToken ?? null
  }));
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
      readFromPostgresPercentage: env.readFromPostgresPercentage,
      mediaStorageRoot: env.mediaStorageRoot,
      mediaPublicBaseUrl: env.mediaPublicBaseUrl,
      mediaMaxFileBytes: env.mediaMaxFileBytes
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
