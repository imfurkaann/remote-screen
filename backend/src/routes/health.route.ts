import { Router } from "express";

import { isPostgresConnected } from "../lib/postgres.js";
import { postgresCircuitBreaker } from "../lib/circuit-breaker.js";
import { metrics } from "../lib/metrics.js";

export function buildHealthRouter(): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    const cbState = postgresCircuitBreaker.getDiagnostics();
    
    res.json({
      ok: true,
      service: "backend",
      version: "0.1.0",
      postgres: {
        connected: isPostgresConnected(),
        circuitBreaker: {
          state: cbState.state,
          healthy: cbState.state === 'CLOSED',
          consecutiveFailures: cbState.consecutiveFailures,
          lastFailureTime: cbState.lastFailureTime
        }
      }
    });
  });

  /**
   * Metrics endpoint for Prometheus scraping
   * Returns comprehensive migration observability metrics
   */
  router.get("/metrics", (_req, res) => {
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(metrics.toPrometheus());
  });

  /**
   * Detailed diagnostics endpoint for debugging
   * Includes circuit breaker state, metrics snapshot, and system info
   */
  router.get("/health/detailed", (_req, res) => {
    const cbDiags = postgresCircuitBreaker.getDiagnostics();
    const metricsSnapshot = metrics.getSnapshot();

    res.json({
      ok: true,
      service: "backend",
      timestamp: new Date().toISOString(),
      postgres: {
        connected: isPostgresConnected(),
        circuitBreaker: cbDiags
      },
      migration: {
        shadowOperations: metricsSnapshot.shadowWrites,
        shadowReads: metricsSnapshot.shadowReads,
        consistency: {
          postgresHealthy: metricsSnapshot.circuitBreaker.postgresHealthy,
          readFailureRate: metricsSnapshot.shadowReads.total > 0 
            ? (metricsSnapshot.shadowReads.postgresFailures / metricsSnapshot.shadowReads.total * 100).toFixed(2) + '%'
            : 'N/A'
        }
      }
    });
  });

  return router;
}
