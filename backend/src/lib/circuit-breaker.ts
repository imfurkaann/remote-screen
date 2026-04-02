/**
 * Circuit breaker pattern for PostgreSQL reliability.
 * Prevents cascading failures by automatically fallback to MongoDB
 * when PostgreSQL becomes unavailable.
 *
 * States:
 * - CLOSED (healthy): Normal operation, use PostgreSQL
 * - OPEN (failing): PostgreSQL unavailable, fallback to MongoDB
 * - HALF_OPEN (testing): Testing if PostgreSQL recovered
 */

import { Logger } from './logger.js';
import { metrics } from './metrics.js';

const logger = new Logger('CircuitBreaker');

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  // Number of consecutive failures to trigger OPEN state
  failureThreshold: number;
  // Time in milliseconds before attempting to recover (HALF_OPEN)
  resetTimeoutMs: number;
  // Name for logging purposes
  name: string;
}

export class CircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED';
  private consecutiveFailures = 0;
  private lastFailureTime: Date | undefined;
  private nextAttemptTime: Date | undefined;
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: config.failureThreshold ?? 5,
      resetTimeoutMs: config.resetTimeoutMs ?? 30_000, // 30 seconds
      name: config.name ?? 'PostgreSQL'
    };
  }

  /**
   * Check if operations should proceed
   */
  canExecute(): boolean {
    if (this.state === 'CLOSED') {
      return true;
    }

    if (this.state === 'OPEN') {
      if (!this.nextAttemptTime) {
        this.nextAttemptTime = new Date(Date.now() + this.config.resetTimeoutMs);
      }

      if (Date.now() >= this.nextAttemptTime.getTime()) {
        logger.info(`${this.config.name} circuit breaker entering HALF_OPEN state for recovery test`, {
          name: this.config.name
        });
        this.state = 'HALF_OPEN';
        return true;
      }

      return false;
    }

    // HALF_OPEN: allow single attempt
    return true;
  }

  /**
   * Record successful operation
   */
  recordSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      logger.info(`${this.config.name} circuit breaker recovered, returning to CLOSED`, {
        name: this.config.name
      });
      this.state = 'CLOSED';
      this.consecutiveFailures = 0;
      this.lastFailureTime = undefined;
      this.nextAttemptTime = undefined;
      metrics.resetCircuitBreaker();
      return;
    }

    if (this.state === 'CLOSED') {
      this.consecutiveFailures = 0;
    }
  }

  /**
   * Record failed operation
   */
  recordFailure(error: Error): void {
    this.consecutiveFailures++;
    this.lastFailureTime = new Date();

    logger.warn(`${this.config.name} operation failed`, {
      name: this.config.name,
      consecutiveFailures: this.consecutiveFailures,
      failureThreshold: this.config.failureThreshold
    }, error);

    metrics.recordCircuitBreakerFailure();

    if (this.consecutiveFailures >= this.config.failureThreshold) {
      const previousState = this.state;
      this.state = 'OPEN';
      this.nextAttemptTime = new Date(Date.now() + this.config.resetTimeoutMs);

      logger.error(`${this.config.name} circuit breaker opened after ${this.consecutiveFailures} failures`, error, {
        name: this.config.name,
        previousState,
        newState: this.state,
        resetTimeoutMs: this.config.resetTimeoutMs
      });
    }
  }

  /**
   * Get current state
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Get diagnostics for health checks
   */
  getDiagnostics() {
    return {
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      failureThreshold: this.config.failureThreshold,
      lastFailureTime: this.lastFailureTime ? this.lastFailureTime.toISOString() : null,
      nextAttemptTime: this.nextAttemptTime ? this.nextAttemptTime.toISOString() : null,
      name: this.config.name
    };
  }
}

export const postgresCircuitBreaker = new CircuitBreaker({
  name: 'PostgreSQL',
  failureThreshold: 5,
  resetTimeoutMs: 30_000
});
