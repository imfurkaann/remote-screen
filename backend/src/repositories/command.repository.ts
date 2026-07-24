import { getPostgresPool, isPostgresConnected } from "../lib/postgres.js";
import { Logger } from "../lib/logger.js";
import { metrics } from "../lib/metrics.js";
import { postgresCircuitBreaker } from "../lib/circuit-breaker.js";
import { withRetry } from "../lib/retry.js";

const logger = new Logger('CommandRepository');

type ShadowCommandInput = {
  tenantId: string;
  deviceId: string;
  requestedByUserId: string | null;
  commandId: string;
  commandType: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  maxAttempts: number;
  timeoutMs: number;
  sentAt: Date | null;
  ackAt: Date | null;
  completedAt: Date | null;
  timeoutAt: Date | null;
  screenshotUrl: string | null;
  errorMessage: string | null;
};

export type ShadowCommandRow = {
  id: string;
  device_id: string;
  requested_by_user_id: string | null;
  command_id: string;
  command_type: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  max_attempts: number;
  timeout_ms: number;
  sent_at: Date | null;
  ack_at: Date | null;
  completed_at: Date | null;
  timeout_at: Date | null;
  screenshot_url: string | null;
  error_message: string | null;
};

/**
 * Command repository with shadow write resilience
 */
export class CommandRepository {
  /**
   * Upsert shadow command with retry logic and comprehensive logging
   * Non-blocking: failures are logged but do not throw
   */
  async upsertShadowCommand(input: ShadowCommandInput): Promise<void> {
    if (!isPostgresConnected()) {
      logger.debug('PostgreSQL not connected, skipping shadow write', {
        operation: 'upsertShadowCommand',
        tenantId: input.tenantId,
        commandId: input.commandId
      });
      return;
    }

    if (!postgresCircuitBreaker.canExecute()) {
      logger.warn('PostgreSQL circuit breaker is OPEN, skipping shadow write', {
        operation: 'upsertShadowCommand',
        tenantId: input.tenantId,
        commandId: input.commandId,
        circuitBreakerState: postgresCircuitBreaker.getState()
      });
      return;
    }

    try {
      await withRetry(
        () => this.performUpsert(input),
        `shadow-command-upsert[${input.commandId}]`,
        { maxRetries: 2, initialDelayMs: 50 }
      );
      postgresCircuitBreaker.recordSuccess();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      postgresCircuitBreaker.recordFailure(err);

      logger.error('Failed to upsert shadow command after retries', err, {
        operation: 'upsertShadowCommand',
        tenantId: input.tenantId,
        deviceId: input.deviceId,
        commandId: input.commandId,
        commandType: input.commandType,
        errorMessage: err.message,
        circuitBreakerState: postgresCircuitBreaker.getState()
      });
    }
  }

  /**
   * Internal: Perform actual upsert operation
   */
  private async performUpsert(input: ShadowCommandInput): Promise<void> {
    const pool = getPostgresPool();
    await pool.query(
      `INSERT INTO commands (
        tenant_id, device_id, requested_by_user_id, command_id, command_type, payload, status,
        attempts, max_attempts, timeout_ms, sent_at, ack_at, completed_at,
        timeout_at, screenshot_url, error_message
      )
      VALUES (
        $1::uuid, $2, $3, $4, $5, $6::jsonb, $7,
        $8, $9, $10, $11, $12, $13,
        $14, $15, $16
      )
      ON CONFLICT (tenant_id, device_id, command_id) WHERE deleted_at IS NULL
      DO UPDATE SET
        requested_by_user_id = EXCLUDED.requested_by_user_id,
        command_type = EXCLUDED.command_type,
        payload = EXCLUDED.payload,
        status = EXCLUDED.status,
        attempts = EXCLUDED.attempts,
        max_attempts = EXCLUDED.max_attempts,
        timeout_ms = EXCLUDED.timeout_ms,
        sent_at = EXCLUDED.sent_at,
        ack_at = EXCLUDED.ack_at,
        completed_at = EXCLUDED.completed_at,
        timeout_at = EXCLUDED.timeout_at,
        screenshot_url = EXCLUDED.screenshot_url,
        error_message = EXCLUDED.error_message,
        updated_at = CURRENT_TIMESTAMP`,
      [
        input.tenantId,
        input.deviceId,
        input.requestedByUserId,
        input.commandId,
        input.commandType,
        JSON.stringify(input.payload),
        input.status,
        input.attempts,
        input.maxAttempts,
        input.timeoutMs,
        input.sentAt,
        input.ackAt,
        input.completedAt,
        input.timeoutAt,
        input.screenshotUrl,
        input.errorMessage
      ]
    );
  }

  async listShadowCommands(tenantId: string, deviceId: string, limit: number): Promise<ShadowCommandRow[]> {
    if (!isPostgresConnected()) {
      logger.debug('PostgreSQL not connected, returning empty list', {
        operation: 'listShadowCommands',
        tenantId,
        deviceId
      });
      return [];
    }

    if (!postgresCircuitBreaker.canExecute()) {
      logger.debug('PostgreSQL circuit breaker is OPEN, returning empty list', {
        operation: 'listShadowCommands',
        tenantId,
        deviceId,
        circuitBreakerState: postgresCircuitBreaker.getState()
      });
      return [];
    }

    const startTime = Date.now();
    try {
      const pool = getPostgresPool();
      const result = await pool.query<ShadowCommandRow>(
        `SELECT id, device_id, requested_by_user_id, command_id, command_type, payload, status,
                attempts, max_attempts, timeout_ms, sent_at, ack_at, completed_at,
                timeout_at, screenshot_url, error_message
         FROM commands
         WHERE tenant_id = $1::uuid
           AND device_id = $2
           AND deleted_at IS NULL
         ORDER BY created_at DESC
         LIMIT $3`,
        [tenantId, deviceId, Math.min(Math.max(Math.trunc(limit), 1), 100)]
      );

      const latencyMs = Date.now() - startTime;
      postgresCircuitBreaker.recordSuccess();
      metrics.recordShadowRead('postgres', latencyMs);

      logger.debug('Shadow commands listed from PostgreSQL', {
        operation: 'listShadowCommands',
        tenantId,
        deviceId,
        count: result.rows.length,
        latencyMs
      });

      return result.rows;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      postgresCircuitBreaker.recordFailure(err);

      const latencyMs = Date.now() - startTime;
      metrics.recordShadowRead('mongo', latencyMs, true);

      logger.warn('Failed to list shadow commands from PostgreSQL, will fallback to MongoDB', {
        operation: 'listShadowCommands',
        tenantId,
        deviceId,
        latencyMs,
        errorMessage: err.message,
        circuitBreakerState: postgresCircuitBreaker.getState()
      }, err);

      return [];
    }
  }

  async getShadowCommand(tenantId: string, deviceId: string, commandId: string): Promise<ShadowCommandRow | null> {
    if (!isPostgresConnected()) {
      logger.debug('PostgreSQL not connected, returning null', {
        operation: 'getShadowCommand',
        tenantId,
        deviceId,
        commandId
      });
      return null;
    }

    if (!postgresCircuitBreaker.canExecute()) {
      logger.debug('PostgreSQL circuit breaker is OPEN, returning null', {
        operation: 'getShadowCommand',
        tenantId,
        deviceId,
        commandId,
        circuitBreakerState: postgresCircuitBreaker.getState()
      });
      return null;
    }

    const startTime = Date.now();
    try {
      const pool = getPostgresPool();
      const result = await pool.query<ShadowCommandRow>(
        `SELECT id, device_id, requested_by_user_id, command_id, command_type, payload, status,
                attempts, max_attempts, timeout_ms, sent_at, ack_at, completed_at,
                timeout_at, screenshot_url, error_message
         FROM commands
         WHERE tenant_id = $1::uuid
           AND device_id = $2
           AND command_id = $3
           AND deleted_at IS NULL
         LIMIT 1`,
        [tenantId, deviceId, commandId]
      );

      const latencyMs = Date.now() - startTime;
      postgresCircuitBreaker.recordSuccess();
      metrics.recordShadowRead('postgres', latencyMs);

      logger.debug('Shadow command fetched from PostgreSQL', {
        operation: 'getShadowCommand',
        tenantId,
        deviceId,
        commandId,
        found: result.rows.length > 0,
        latencyMs
      });

      return result.rows[0] ?? null;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      postgresCircuitBreaker.recordFailure(err);

      const latencyMs = Date.now() - startTime;
      metrics.recordShadowRead('mongo', latencyMs, true);

      logger.warn('Failed to fetch shadow command from PostgreSQL, will fallback to MongoDB', {
        operation: 'getShadowCommand',
        tenantId,
        deviceId,
        commandId,
        latencyMs,
        circuitBreakerState: postgresCircuitBreaker.getState()
      }, err);

      return null;
    }
  }
}

export const commandRepository = new CommandRepository();
