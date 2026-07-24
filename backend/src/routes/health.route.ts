import { timingSafeEqual } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import mongoose from "mongoose";

import { isPostgresConnected } from "../lib/postgres.js";
import { postgresCircuitBreaker } from "../lib/circuit-breaker.js";
import { metrics } from "../lib/metrics.js";

type HealthRouteDeps = {
  nodeEnv: string;
  pgEnabled: boolean;
  metricsToken?: string | null;
};

function tokenMatches(actual: string | undefined, expected: string): boolean {
  if (!actual?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(actual.slice(7));
  const target = Buffer.from(expected);
  return supplied.length === target.length && timingSafeEqual(supplied, target);
}

export function buildHealthRouter(deps: HealthRouteDeps): Router {
  const router = Router();

  router.get("/health/live", (_req, res) => {
    res.json({ ok: true, service: "backend" });
  });

  router.get("/health", (_req, res) => {
    const mongoConnected = mongoose.connection.readyState === 1;
    const postgresConnected = isPostgresConnected();
    const ready = mongoConnected && (!deps.pgEnabled || postgresConnected);
    const cbState = postgresCircuitBreaker.getDiagnostics();

    res.status(ready ? 200 : 503).json({
      ok: ready,
      service: "backend",
      version: "0.1.0",
      mongodb: { connected: mongoConnected },
      postgres: {
        required: deps.pgEnabled,
        connected: postgresConnected,
        circuitBreaker: {
          state: cbState.state,
          healthy: cbState.state === "CLOSED",
          consecutiveFailures: cbState.consecutiveFailures,
          lastFailureTime: cbState.lastFailureTime
        }
      }
    });
  });

  const requireMetricsToken = (req: Request, res: Response, next: NextFunction) => {
    if (deps.nodeEnv !== "production") {
      next();
      return;
    }
    if (!deps.metricsToken || !tokenMatches(req.headers.authorization, deps.metricsToken)) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Metrics token is required" });
      return;
    }
    next();
  };

  router.get("/metrics", requireMetricsToken, (_req, res) => {
    res.set("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    res.send(metrics.toPrometheus());
  });

  router.get("/health/detailed", requireMetricsToken, (_req, res) => {
    const cbDiags = postgresCircuitBreaker.getDiagnostics();
    const metricsSnapshot = metrics.getSnapshot();
    res.json({
      ok: mongoose.connection.readyState === 1 && (!deps.pgEnabled || isPostgresConnected()),
      service: "backend",
      timestamp: new Date().toISOString(),
      mongodb: { connected: mongoose.connection.readyState === 1 },
      postgres: { required: deps.pgEnabled, connected: isPostgresConnected(), circuitBreaker: cbDiags },
      migration: {
        shadowOperations: metricsSnapshot.shadowWrites,
        shadowReads: metricsSnapshot.shadowReads,
        consistency: {
          postgresHealthy: metricsSnapshot.circuitBreaker.postgresHealthy,
          readFailureRate: metricsSnapshot.shadowReads.total > 0
            ? `${(metricsSnapshot.shadowReads.postgresFailures / metricsSnapshot.shadowReads.total * 100).toFixed(2)}%`
            : "N/A"
        }
      }
    });
  });

  return router;
}