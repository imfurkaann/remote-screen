import { getPostgresPool, isPostgresConnected } from "../lib/postgres.js";
import { Logger } from "../lib/logger.js";
import { postgresCircuitBreaker } from "../lib/circuit-breaker.js";
import { withRetry } from "../lib/retry.js";

const logger = new Logger('DeviceRepository');

type SyncPairingRequestInput = {
  tenantId: string;
  hardwareId: string;
};

type MarkPairedInput = {
  tenantId: string;
  hardwareId: string;
  pairedOwnerUserId: string;
};

/**
 * Device repository with shadow write resilience
 */
export class DeviceRepository {
  /**
   * Sync pairing request to PostgreSQL shadow table
   * Non-blocking: failures are logged but do not throw
   */
  async syncPairingRequest(input: SyncPairingRequestInput): Promise<void> {
    if (!isPostgresConnected()) {
      logger.debug('PostgreSQL not connected, skipping device sync', {
        operation: 'syncPairingRequest',
        tenantId: input.tenantId,
        hardwareId: input.hardwareId
      });
      return;
    }

    if (!postgresCircuitBreaker.canExecute()) {
      logger.warn('PostgreSQL circuit breaker is OPEN, skipping device sync', {
        operation: 'syncPairingRequest',
        tenantId: input.tenantId,
        hardwareId: input.hardwareId,
        circuitBreakerState: postgresCircuitBreaker.getState()
      });
      return;
    }

    try {
      await withRetry(
        () => this.performSyncPairingRequest(input),
        `device-sync[${input.hardwareId}]`,
        { maxRetries: 2, initialDelayMs: 50 }
      );
      postgresCircuitBreaker.recordSuccess();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      postgresCircuitBreaker.recordFailure(err);

      logger.error('Failed to sync pairing request after retries', err, {
        operation: 'syncPairingRequest',
        tenantId: input.tenantId,
        hardwareId: input.hardwareId,
        circuitBreakerState: postgresCircuitBreaker.getState()
      });
    }
  }

  /**
   * Internal: Perform actual sync operation
   */
  private async performSyncPairingRequest(input: SyncPairingRequestInput): Promise<void> {
    const pool = getPostgresPool();

    // Keep shadow table aligned with Mongo behavior by hardware_id.
    const existing = await pool.query<{ id: string }>(
      `SELECT id
       FROM devices
       WHERE hardware_id = $1
         AND deleted_at IS NULL
       ORDER BY updated_at DESC
       LIMIT 1`,
      [input.hardwareId]
    );

    if (existing.rowCount && existing.rows[0]) {
      await pool.query(
        `UPDATE devices
         SET tenant_id = $1,
             status = 'offline',
             paired_owner_user_id = NULL,
             current_playlist_id = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [input.tenantId, existing.rows[0].id]
      );

      logger.debug('Device sync: updated existing device', {
        operation: 'syncPairingRequest',
        tenantId: input.tenantId,
        hardwareId: input.hardwareId,
        deviceId: existing.rows[0].id
      });

      return;
    }

    await pool.query(
      `INSERT INTO devices (
        tenant_id,
        hardware_id,
        status,
        paired_owner_user_id,
        current_playlist_id
      )
      VALUES ($1, $2, 'offline', NULL, NULL)`,
      [input.tenantId, input.hardwareId]
    );

    logger.debug('Device sync: inserted new device', {
      operation: 'syncPairingRequest',
      tenantId: input.tenantId,
      hardwareId: input.hardwareId
    });
  }

  /**
   * Mark device as paired by hardware ID
   * Non-blocking: failures are logged but do not throw
   */
  async markPairedByHardware(input: MarkPairedInput): Promise<void> {
    if (!isPostgresConnected()) {
      logger.debug('PostgreSQL not connected, skipping mark paired', {
        operation: 'markPairedByHardware',
        tenantId: input.tenantId,
        hardwareId: input.hardwareId
      });
      return;
    }

    if (!postgresCircuitBreaker.canExecute()) {
      logger.warn('PostgreSQL circuit breaker is OPEN, skipping mark paired', {
        operation: 'markPairedByHardware',
        tenantId: input.tenantId,
        hardwareId: input.hardwareId,
        circuitBreakerState: postgresCircuitBreaker.getState()
      });
      return;
    }

    try {
      await withRetry(
        () => this.performMarkPaired(input),
        `device-mark-paired[${input.hardwareId}]`,
        { maxRetries: 2, initialDelayMs: 50 }
      );
      postgresCircuitBreaker.recordSuccess();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      postgresCircuitBreaker.recordFailure(err);

      logger.error('Failed to mark device paired after retries', err, {
        operation: 'markPairedByHardware',
        tenantId: input.tenantId,
        hardwareId: input.hardwareId,
        circuitBreakerState: postgresCircuitBreaker.getState()
      });
    }
  }

  /**
   * Internal: Perform actual mark paired operation
   */
  private async performMarkPaired(input: MarkPairedInput): Promise<void> {
    const pool = getPostgresPool();
    await pool.query(
      `UPDATE devices
       SET paired_owner_user_id = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = $2
         AND hardware_id = $3
         AND deleted_at IS NULL`,
      [input.pairedOwnerUserId, input.tenantId, input.hardwareId]
    );

    logger.debug('Device marked as paired', {
      operation: 'markPairedByHardware',
      tenantId: input.tenantId,
      hardwareId: input.hardwareId,
      pairedOwnerUserId: input.pairedOwnerUserId
    });
  }

  /**
   * Update device status by hardware ID
   */
  async updateStatusByHardware(tenantId: string, hardwareId: string, status: string): Promise<void> {
    if (!isPostgresConnected()) {
      return;
    }

    try {
      const pool = getPostgresPool();
      await pool.query(
        `UPDATE devices
         SET status = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = $2
           AND hardware_id = $3
           AND deleted_at IS NULL`,
        [status, tenantId, hardwareId]
      );

      logger.debug('Device status updated in PostgreSQL', {
        operation: 'updateStatusByHardware',
        tenantId,
        hardwareId,
        status
      });
    } catch (error) {
      logger.error('Failed to update device status in PostgreSQL', error instanceof Error ? error : new Error(String(error)), {
        operation: 'updateStatusByHardware',
        tenantId,
        hardwareId,
        status
      });
    }
  }

  /**
   * Reset all devices status to offline in PostgreSQL on startup
   */
  async resetAllStatusesToOffline(): Promise<void> {
    if (!isPostgresConnected()) {
      return;
    }

    try {
      const pool = getPostgresPool();
      await pool.query(
        `UPDATE devices
         SET status = 'offline',
             updated_at = CURRENT_TIMESTAMP
         WHERE deleted_at IS NULL`
      );
      logger.debug('Reset all PostgreSQL device statuses to offline', {
        operation: 'resetAllStatusesToOffline'
      });
    } catch (error) {
      logger.error('Failed to reset PostgreSQL device statuses to offline', error instanceof Error ? error : new Error(String(error)), {
        operation: 'resetAllStatusesToOffline'
      });
    }
  }
}

export const deviceRepository = new DeviceRepository();
