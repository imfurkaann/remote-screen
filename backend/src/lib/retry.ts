import { Logger } from "./logger.js";
import { metrics } from "./metrics.js";

const logger = new Logger("Retry");

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterFactor: number;
  shouldRetry: (error: Error) => boolean;
}

const TRANSIENT_ERROR_CODES = new Set([
  "40001", // serialization_failure
  "40P01", // deadlock_detected
  "55P03", // lock_not_available
  "53300", // too_many_connections
  "57P01", "57P02", "57P03", // server shutdown/startup states
  "ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT", "ENETUNREACH", "EHOSTUNREACH"
]);

export function isTransientDatabaseError(error: Error): boolean {
  const code = typeof (error as Error & { code?: unknown }).code === "string"
    ? String((error as Error & { code: string }).code)
    : "";
  return code.startsWith("08") || TRANSIENT_ERROR_CODES.has(code);
}

const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 5_000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
  shouldRetry: isTransientDatabaseError
};

export async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  let lastError: Error | null = null;
  let retried = false;

  for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt += 1) {
    try {
      const startedAt = Date.now();
      const result = await operation();
      const latencyMs = Date.now() - startedAt;
      metrics.recordShadowWrite(true, latencyMs, attempt > 0);
      if (attempt > 0) {
        logger.info(`${operationName} succeeded after ${attempt} retries`, { operationName, attempt, latencyMs });
      }
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const retryable = finalConfig.shouldRetry(lastError);
      const canRetry = retryable && attempt < finalConfig.maxRetries;

      if (!canRetry) {
        metrics.recordShadowWrite(false, 0, retried);
        logger.error(
          retryable
            ? `${operationName} failed after ${attempt} retries`
            : `${operationName} failed with a non-retryable error`,
          lastError,
          { operationName, totalAttempts: attempt + 1, retryable }
        );
        break;
      }

      const delayMs = calculateBackoff(attempt, finalConfig);
      logger.warn(`${operationName} failed, retrying in ${delayMs}ms`, {
        operationName,
        attempt,
        maxRetries: finalConfig.maxRetries,
        nextDelayMs: delayMs
      }, lastError);
      retried = true;
      await sleep(delayMs);
    }
  }

  throw lastError ?? new Error(`${operationName} failed`);
}

function calculateBackoff(attemptNumber: number, config: RetryConfig): number {
  const baseDelay = Math.min(
    config.initialDelayMs * Math.pow(config.backoffMultiplier, attemptNumber),
    config.maxDelayMs
  );
  const jitterRange = baseDelay * Math.max(0, Math.min(1, config.jitterFactor));
  return Math.max(0, Math.round(baseDelay - jitterRange + Math.random() * jitterRange * 2));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}