/**
 * Retry logic with exponential backoff for shadow write operations.
 * Ensures shadow writes are eventually consistent even during transient PostgreSQL failures.
 */

import { Logger } from './logger.js';
import { metrics } from './metrics.js';

const logger = new Logger('Retry');

export interface RetryConfig {
  // Maximum number of retry attempts (total attempts = maxRetries + 1)
  maxRetries: number;
  // Initial backoff delay in milliseconds
  initialDelayMs: number;
  // Maximum backoff delay in milliseconds
  maxDelayMs: number;
  // Exponential backoff multiplier (2 = double each retry)
  backoffMultiplier: number;
  // Add random jitter (0-1) to prevent thundering herd
  jitterFactor: number;
}

const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  jitterFactor: 0.1
};

/**
 * Execute function with automatic retry on failure
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  let lastError: Error | null = null;
  let retried = false;

  for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
    try {
      const startTime = Date.now();
      const result = await operation();
      const latencyMs = Date.now() - startTime;

      if (attempt > 0) {
        logger.info(`${operationName} succeeded after ${attempt} retries`, {
          operationName,
          attempt,
          latencyMs
        });
        metrics.recordShadowWrite(true, latencyMs, true);
      } else {
        metrics.recordShadowWrite(true, latencyMs, false);
      }

      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < finalConfig.maxRetries) {
        const delayMs = calculateBackoff(attempt, finalConfig);

        logger.warn(`${operationName} failed, retrying in ${delayMs}ms`, {
          operationName,
          attempt,
          maxRetries: finalConfig.maxRetries,
          nextDelayMs: delayMs
        }, lastError);

        retried = true;
        await sleep(delayMs);
      } else {
        // Record final failure
        metrics.recordShadowWrite(false, 0, retried);

        logger.error(`${operationName} failed after ${finalConfig.maxRetries} retries`, lastError, {
          operationName,
          totalAttempts: attempt + 1,
          maxRetries: finalConfig.maxRetries
        });
      }
    }
  }

  throw lastError || new Error(`${operationName} failed`);
}

/**
 * Calculate exponential backoff delay with jitter
 */
function calculateBackoff(attemptNumber: number, config: RetryConfig): number {
  // Exponential: initialDelay * (multiplier ^ attemptNumber)
  let delayMs = config.initialDelayMs * Math.pow(config.backoffMultiplier, attemptNumber);

  // Cap at maxDelay
  delayMs = Math.min(delayMs, config.maxDelayMs);

  // Add jitter: random between delayMs * (1 - jitter) and delayMs
  const jitter = delayMs * config.jitterFactor * Math.random();
  return delayMs + jitter;
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
