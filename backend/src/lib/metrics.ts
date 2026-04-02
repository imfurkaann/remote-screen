/**
 * Metrics collection and tracking for PostgreSQL migration observability.
 * Tracks shadow writes, reads, failures, and data source distribution.
 */

export interface MetricsSnapshot {
  timestamp: string;
  shadowWrites: {
    total: number;
    succeeded: number;
    failed: number;
    retried: number;
    avgLatencyMs: number;
  };
  shadowReads: {
    total: number;
    fromPostgres: number;
    fromMongo: number;
    postgresFailures: number;
    avgLatencyMs: number;
  };
  circuitBreaker: {
    postgresHealthy: boolean;
    consecutiveFailures: number;
    lastFailureAt: string | undefined;
  };
}

export class Metrics {
  private shadowWriteTotal = 0;
  private shadowWriteSucceeded = 0;
  private shadowWriteFailed = 0;
  private shadowWriteRetried = 0;
  private shadowWriteLatencies: number[] = [];

  private shadowReadTotal = 0;
  private shadowReadFromPostgres = 0;
  private shadowReadFromMongo = 0;
  private shadowReadPostgresFailures = 0;
  private shadowReadLatencies: number[] = [];

  private circuitBreakerConsecutiveFailures = 0;
  private circuitBreakerLastFailureAt: Date | undefined;
  private circuitBreakerHealthy = true;

  /**
   * Record shadow write operation
   */
  recordShadowWrite(success: boolean, latencyMs: number, retried: boolean = false): void {
    this.shadowWriteTotal++;
    if (success) {
      this.shadowWriteSucceeded++;
    } else {
      this.shadowWriteFailed++;
    }
    if (retried) {
      this.shadowWriteRetried++;
    }
    this.shadowWriteLatencies.push(latencyMs);

    // Keep only last 1000 latency values
    if (this.shadowWriteLatencies.length > 1000) {
      this.shadowWriteLatencies = this.shadowWriteLatencies.slice(-1000);
    }
  }

  /**
   * Record shadow read operation
   */
  recordShadowRead(source: 'postgres' | 'mongo', latencyMs: number, postgresFailure: boolean = false): void {
    this.shadowReadTotal++;
    if (source === 'postgres') {
      this.shadowReadFromPostgres++;
    } else {
      this.shadowReadFromMongo++;
    }
    if (postgresFailure) {
      this.shadowReadPostgresFailures++;
    }
    this.shadowReadLatencies.push(latencyMs);

    // Keep only last 1000 latency values
    if (this.shadowReadLatencies.length > 1000) {
      this.shadowReadLatencies = this.shadowReadLatencies.slice(-1000);
    }
  }

  /**
   * Record PostgreSQL circuit breaker state change
   */
  recordCircuitBreakerFailure(): void {
    this.circuitBreakerHealthy = false;
    this.circuitBreakerConsecutiveFailures++;
    this.circuitBreakerLastFailureAt = new Date();
  }

  /**
   * Reset circuit breaker to healthy state
   */
  resetCircuitBreaker(): void {
    this.circuitBreakerHealthy = true;
    this.circuitBreakerConsecutiveFailures = 0;
    this.circuitBreakerLastFailureAt = undefined;
  }

  /**
   * Get current metrics snapshot
   */
  getSnapshot(): MetricsSnapshot {
    const avgWriteLatency =
      this.shadowWriteLatencies.length > 0
        ? this.shadowWriteLatencies.reduce((a, b) => a + b, 0) / this.shadowWriteLatencies.length
        : 0;

    const avgReadLatency =
      this.shadowReadLatencies.length > 0
        ? this.shadowReadLatencies.reduce((a, b) => a + b, 0) / this.shadowReadLatencies.length
        : 0;

    return {
      timestamp: new Date().toISOString(),
      shadowWrites: {
        total: this.shadowWriteTotal,
        succeeded: this.shadowWriteSucceeded,
        failed: this.shadowWriteFailed,
        retried: this.shadowWriteRetried,
        avgLatencyMs: Math.round(avgWriteLatency * 100) / 100
      },
      shadowReads: {
        total: this.shadowReadTotal,
        fromPostgres: this.shadowReadFromPostgres,
        fromMongo: this.shadowReadFromMongo,
        postgresFailures: this.shadowReadPostgresFailures,
        avgLatencyMs: Math.round(avgReadLatency * 100) / 100
      },
      circuitBreaker: {
        postgresHealthy: this.circuitBreakerHealthy,
        consecutiveFailures: this.circuitBreakerConsecutiveFailures,
        lastFailureAt: this.circuitBreakerLastFailureAt?.toISOString() as string | undefined
      }
    };
  }

  /**
   * Export as Prometheus text format (for monitoring integration)
   */
  toPrometheus(): string {
    const snapshot = this.getSnapshot();
    const lines: string[] = [];

    lines.push('# HELP shadow_writes_total Total shadow write operations');
    lines.push('# TYPE shadow_writes_total counter');
    lines.push(`shadow_writes_total ${snapshot.shadowWrites.total}`);

    lines.push('# HELP shadow_writes_succeeded Successful shadow writes');
    lines.push('# TYPE shadow_writes_succeeded counter');
    lines.push(`shadow_writes_succeeded ${snapshot.shadowWrites.succeeded}`);

    lines.push('# HELP shadow_writes_failed Failed shadow writes');
    lines.push('# TYPE shadow_writes_failed counter');
    lines.push(`shadow_writes_failed ${snapshot.shadowWrites.failed}`);

    lines.push('# HELP shadow_writes_latency_avg Average shadow write latency in ms');
    lines.push('# TYPE shadow_writes_latency_avg gauge');
    lines.push(`shadow_writes_latency_avg ${snapshot.shadowWrites.avgLatencyMs}`);

    lines.push('# HELP shadow_reads_total Total shadow read operations');
    lines.push('# TYPE shadow_reads_total counter');
    lines.push(`shadow_reads_total ${snapshot.shadowReads.total}`);

    lines.push('# HELP shadow_reads_postgres Reads from PostgreSQL');
    lines.push('# TYPE shadow_reads_postgres counter');
    lines.push(`shadow_reads_postgres ${snapshot.shadowReads.fromPostgres}`);

    lines.push('# HELP shadow_reads_mongo Reads from MongoDB (fallback)');
    lines.push('# TYPE shadow_reads_mongo counter');
    lines.push(`shadow_reads_mongo ${snapshot.shadowReads.fromMongo}`);

    lines.push('# HELP shadow_reads_latency_avg Average shadow read latency in ms');
    lines.push('# TYPE shadow_reads_latency_avg gauge');
    lines.push(`shadow_reads_latency_avg ${snapshot.shadowReads.avgLatencyMs}`);

    lines.push('# HELP postgres_circuit_breaker_healthy PostgreSQL circuit breaker status');
    lines.push('# TYPE postgres_circuit_breaker_healthy gauge');
    lines.push(`postgres_circuit_breaker_healthy ${snapshot.circuitBreaker.postgresHealthy ? 1 : 0}`);

    lines.push('# HELP postgres_circuit_breaker_failures Consecutive failures');
    lines.push('# TYPE postgres_circuit_breaker_failures gauge');
    lines.push(`postgres_circuit_breaker_failures ${snapshot.circuitBreaker.consecutiveFailures}`);

    return lines.join('\n') + '\n';
  }
}

export const metrics = new Metrics();
