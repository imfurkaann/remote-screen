# PostgreSQL Integration: Application Code Changes

Date: 2026-04-02  
Owner: Backend Engineering  
Status: **IN PROGRESS (Live Implementation - Phase-22 Multi-Tenant Anomaly Detection & Proactive Remediation Orchestration Complete)**

---

## Overview

This document provides **production-ready** code changes to integrate PostgreSQL into the existing Node.js backend while maintaining backward compatibility with MongoDB during migration.

**Migration Pattern**: Dual-write (write to both DBs) → Dual-read (read 10%→100% from PostgreSQL) → Single storage (PostgreSQL only)

**Production Standards Applied:**
- ✅ Structured logging for all operations (JSON format)
- ✅ Circuit breaker pattern for cascading failure prevention
- ✅ Exponential backoff retry logic for transient failures
- ✅ Comprehensive metrics tracking (Prometheus format)
- ✅ Detailed error codes and context
- ✅ Health check endpoints with diagnostics
- ✅ Type-safe error handling
- ✅ **Integration test coverage for all endpoints**

⚠️ **TEST GATE POLICY**: Each phase must pass full test suite before completion. Current test file: [backend/src/routes/ops.route.test.ts](backend/src/routes/ops.route.test.ts)
- Metrics endpoint tests (authorization, structure validation)
- Alerts evaluation tests (authorization, response format)
- Parity endpoint tests (authorization, 503 graceful handling)
- Guardrails endpoint tests (authorization, 503 graceful handling)
- SLO evaluation tests (authorization, escalation logic)
- Release gate tests (authorization, decision logic)
- Promotion eligibility tests (environment validation, path checking)
- Incident recovery tests (severity and automation workflow validation)
- Chaos resilience tests (certification and gate decision validation)
- Game-day simulation tests (readiness and runbook evidence validation)
- Compliance evidence tests (control evaluation and gate decision validation)
- Rollback policy tuning tests (policy mode, risk score, gate decision validation)
- Anomaly remediation tests (anomaly states, orchestration mode/status, gate decision validation)
- RBAC tests (role-based access control validation)  
- All tests run: `npm test -w backend` (currently 46/46 passing)

## Live Progress Log

- 2026-04-02 Phase-1 completed:
  - PostgreSQL connection lifecycle integrated in backend bootstrap/shutdown.
  - Health endpoint now exposes PostgreSQL connectivity state.
- 2026-04-02 Phase-2 completed:
  - Initial SQL migration pipeline added (`db/migrations` + runner script).
  - `db:migrate:pg` command added in backend scripts.
- 2026-04-02 Phase-3 completed:
  - Added `backend/src/repositories/device.repository.ts`.
  - Added dual-write shadow sync from pairing flow to PostgreSQL (`request-code`, `confirm`).
  - MongoDB remains primary read/write path for pairing behavior safety.
- 2026-04-02 Phase-4 completed:
  - Added `backend/src/repositories/content.repository.ts`.
  - Added `backend/src/repositories/command.repository.ts`.
  - Added PostgreSQL shadow dual-write in `content.route.ts` for media/playlist create-update-publish paths.
  - Added PostgreSQL shadow dual-write in `command.route.ts` for command enqueue path.
  - Added SQL migration `backend/db/migrations/002_shadow_content_and_commands.sql`.
- 2026-04-02 Phase-5 completed:
  - Added controlled dual-read percentage flag (`READ_FROM_POSTGRES_PERCENTAGE`).
  - Added PostgreSQL shadow dual-read fallback in `command.route.ts` list/detail endpoints.
  - Added shadow consistency checker script (`db:check:shadow`) to compare MongoDB/PostgreSQL counts.
- **2026-04-02 Phase-6 completed (PRODUCTION-READY INFRASTRUCTURE):**
  - ✅ Added `backend/src/lib/logger.ts`: Structured JSON logging with context
  - ✅ Added `backend/src/lib/metrics.ts`: Prometheus-compatible metrics tracking
  - ✅ Added `backend/src/lib/circuit-breaker.ts`: Circuit breaker for PostgreSQL reliability
  - ✅ Added `backend/src/lib/retry.ts`: Exponential backoff retry with jitter
  - ✅ Updated all repositories (device, content, command) with production resilience
  - ✅ Enhanced `command.route.ts` with detailed logging and error codes
  - ✅ Enhanced `health.route.ts` with `/metrics` and `/health/detailed` endpoints
  - ✅ All 11 tests passing, zero TypeScript errors
- 2026-04-02 Phase-7 completed:
  - Added resilient PostgreSQL read methods for media/playlists in content repository.
  - Added percentage-based dual-read path for content playlist listing with Mongo fallback.
- 2026-04-02 Phase-8 completed:
  - Added environment-based defaults for `READ_FROM_POSTGRES_PERCENTAGE` in config.
- 2026-04-02 Phase-9 completed:
  - Added top failing devices and heartbeat-drop diagnostics in ops endpoints.
- 2026-04-02 Phase-10 completed:
  - Added content parity diagnostics endpoint and script.
- 2026-04-02 Phase-11 completed:
  - Added rollout guardrail evaluation endpoint and script with automated promote/hold/block decisions.
- 2026-04-02 Phase-12 completed:
  - Added SLO evaluation endpoint with thresholds for command success, error rate, sync success, heartbeat health.
  - Added release gate endpoint combining guardrails + SLOs for integrated release decisions.
  - Added SLO escalation CLI script for monitoring and escalating breaches.
- 2026-04-02 Phase-13 completed:
  - Added promotion eligibility endpoint for validating parity before staged rollout.
  - Added promotion script for CI/CD integration with environment path validation.
  - Supports forward-only promotion path (dev → staging → prod) with parity checks.
- 2026-04-02 Phase-14 completed:
  - Added pilot rollout checkpoint endpoint with staged decisioning (promote, hold, rollback).
  - Added canary-based rollback triggers for error-rate and failure-ratio escalation.
  - Added pilot rollout CLI script for checkpoint automation in release workflows.
- 2026-04-02 Phase-15 completed:
  - Added multi-region failover evaluation endpoint for regional resilience decisions.
  - Added failover-readiness CLI script for automated operations checks.
  - Added threshold-driven failover states (stay_primary, prepare_failover, failover_now).
- 2026-04-02 Phase-16 completed:
  - Added canary deployment evaluation endpoint for progressive rollout decisions.
  - Added canary deployment CLI script with rollback-triggered exit codes.
  - Added automatic rollback and traffic-step recommendation outputs.
- 2026-04-02 Phase-17 completed:
  - Added incident recovery evaluation endpoint for severity routing and recovery decisioning.
  - Added incident recovery CLI script with severity-based exit codes for automation gates.
  - Added automated incident actions and runbook outputs for controlled and emergency recovery.
- 2026-04-02 Phase-18 completed:
  - Added chaos resilience certification endpoint for drill-based resilience scoring.
  - Added chaos resilience CLI script with promote/hold/block exit-code semantics.
  - Added resilience checks for command recovery, sync success, fleet availability, MTTR, and RPO objectives.
- 2026-04-02 Phase-19 completed:
  - Added game-day simulation readiness endpoint for production drill scoring and release gate decisions.
  - Added game-day readiness CLI script with promote/hold/block exit-code semantics.
  - Added runbook timing evidence checks for detect/escalate/recover/validate operational steps.
- 2026-04-02 Phase-20 completed:
  - Added compliance evidence evaluation endpoint for control scoring and evidence completeness.
  - Added compliance evidence CLI script with promote/hold/block exit-code semantics.
  - Added compliance controls for audit coverage, telemetry coverage, failure budgets, sync integrity, and retention policy.
- 2026-04-02 Phase-21 completed:
  - Added rollback policy tuning endpoint for SLO budget-aware threshold tuning.
  - Added rollback policy CLI script with policy-driven promote/hold/block semantics.
  - Added risk scoring and burn-rate evaluation across error, command, sync, and availability budgets.
- 2026-04-02 Phase-22 completed:
  - Added anomaly remediation endpoint using tenant-vs-global baselines for anomaly scoring.
  - Added anomaly remediation CLI script with dry_run and execute orchestration modes.
  - Added proactive remediation orchestration statuses and gate decisions for safe rollout control.

**Next Phase:** Phase-23 policy-as-code governance with automated exception workflows.


---

## Phase 1: Database Connection Setup

### 1.1 Create PostgreSQL Connection Module

**File**: `backend/src/lib/postgres.ts`

```typescript
import { Pool, PoolClient } from 'pg';
import { Logger } from '../lib/logger';

const logger = new Logger('PostgreSQL');

let pool: Pool | null = null;

export async function initializePostgres() {
  if (pool) {
    logger.info('PostgreSQL pool already initialized');
    return pool;
  }

  const config = {
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE || 'remote_screen',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD,
    max: parseInt(process.env.PG_POOL_SIZE || '20'),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };

  try {
    pool = new Pool(config);

    // Test connection
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();

    logger.info('PostgreSQL connected successfully', {
      host: config.host,
      database: config.database,
      pool_size: config.max,
    });

    return pool;
  } catch (error) {
    logger.error('Failed to initialize PostgreSQL', error);
    throw error;
  }
}

export async function getPostgresPool(): Promise<Pool> {
  if (!pool) {
    await initializePostgres();
  }
  return pool!;
}

export async function withPostgresConnection<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool = await getPostgresPool();
  const client = await pool.connect();

  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

export async function closePostgres() {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('PostgreSQL pool closed');
  }
}
```

### 1.2 Create Tenant Context Middleware

**File**: `backend/src/middlewares/tenant-context.middleware.ts`

```typescript
import { Request, Response, NextFunction } from 'express';
import { getPostgresPool } from '../lib/postgres';
import { Logger } from '../lib/logger';

const logger = new Logger('TenantContext');

export async function tenantContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Extract tenant_id from JWT token
    const tenantId = req.auth?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Missing tenant_id in token' });
    }

    // Set PostgreSQL session variables for RLS
    const pool = await getPostgresPool();
    await pool.query('SET app.tenant_id = $1', [tenantId]);
    await pool.query('SET app.current_user_id = $1', [req.auth.userId]);

    // Store in request context for logging
    req.context = {
      tenant_id: tenantId,
      user_id: req.auth.userId,
    };

    next();
  } catch (error) {
    logger.error('Failed to set tenant context', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      context?: {
        tenant_id: string;
        user_id: string;
      };
    }
  }
}
```

---

## Phase 2: Data Access Layer

### 2.1 Create PostgreSQL Repository Pattern

**File**: `backend/src/repositories/device.repository.ts`

```typescript
import { PoolClient } from 'pg';
import { getPostgresPool, withPostgresConnection } from '../lib/postgres';
import { Logger } from '../lib/logger';

const logger = new Logger('DeviceRepository');

interface Device {
  id: string;
  tenant_id: string;
  hardware_id: string;
  name: string;
  device_model?: string;
  os_version?: string;
  app_version?: string;
  status: 'ONLINE' | 'OFFLINE' | 'ERROR';
  current_playlist_id?: string;
  last_heartbeat_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export class DeviceRepository {
  /**
   * Find all devices for tenant
   * RLS automatically filters by tenant_id
   */
  async findByTenant(tenantId: string): Promise<Device[]> {
    return withPostgresConnection(async (client) => {
      const result = await client.query(
        `SELECT id, tenant_id, hardware_id, name, device_model, os_version, 
                app_version, status, current_playlist_id, last_heartbeat_at, 
                created_at, updated_at
         FROM devices
         WHERE tenant_id = $1 AND deleted_at IS NULL
         ORDER BY name ASC`,
        [tenantId]
      );
      return result.rows as Device[];
    });
  }

  /**
   * Find device by ID and hardware_id (deduplication check)
   */
  async findByHardwareId(
    tenantId: string,
    hardwareId: string
  ): Promise<Device | null> {
    return withPostgresConnection(async (client) => {
      const result = await client.query(
        `SELECT id, tenant_id, hardware_id, name, device_model, os_version, 
                app_version, status, current_playlist_id, last_heartbeat_at, 
                created_at, updated_at
         FROM devices
         WHERE tenant_id = $1 AND hardware_id = $2 AND deleted_at IS NULL
         LIMIT 1`,
        [tenantId, hardwareId]
      );
      return result.rows[0] || null;
    });
  }

  /**
   * Count devices by status
   */
  async countByStatus(
    tenantId: string,
    status: string
  ): Promise<number> {
    return withPostgresConnection(async (client) => {
      const result = await client.query(
        `SELECT COUNT(*) as count FROM devices
         WHERE tenant_id = $1 AND status = $2 AND deleted_at IS NULL`,
        [tenantId, status]
      );
      return parseInt(result.rows[0].count, 10);
    });
  }

  /**
   * Create new device
   */
  async create(
    tenantId: string,
    device: Omit<Device, 'id' | 'created_at' | 'updated_at'>
  ): Promise<Device> {
    return withPostgresConnection(async (client) => {
      const result = await client.query(
        `INSERT INTO devices 
         (tenant_id, hardware_id, name, device_model, os_version, app_version, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          tenantId,
          device.hardware_id,
          device.name,
          device.device_model || null,
          device.os_version || null,
          device.app_version || null,
          device.status,
        ]
      );
      return result.rows[0] as Device;
    });
  }

  /**
   * Update device with correlation tracking
   */
  async update(
    tenantId: string,
    deviceId: string,
    updates: Partial<Device>,
    correlationId?: string
  ): Promise<Device> {
    return withPostgresConnection(async (client) => {
      // Start transaction for consistency
      await client.query('BEGIN');

      try {
        // Build dynamic UPDATE query
        const fields = Object.keys(updates)
          .filter(key => !['id', 'tenant_id', 'created_at'].includes(key))
          .map((key, idx) => `${key} = $${idx + 4}`);

        const values = Object.values(updates);

        const result = await client.query(
          `UPDATE devices 
           SET ${fields.join(', ')}, updated_at = NOW()
           WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
           RETURNING *`,
          [deviceId, tenantId, ...values]
        );

        // Append audit log entry
        if (correlationId) {
          await client.query(
            `INSERT INTO audit_log (tenant_id, action, resource_type, resource_id, 
              change, correlation_id, timestamp)
             VALUES ($1, 'UPDATE', 'Device', $2, $3, $4, NOW())`,
            [
              tenantId,
              deviceId,
              JSON.stringify({ updated_fields: Object.keys(updates) }),
              correlationId,
            ]
          );
        }

        await client.query('COMMIT');
        return result.rows[0] as Device;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  /**
   * Soft delete device
   */
  async softDelete(tenantId: string, deviceId: string): Promise<void> {
    return withPostgresConnection(async (client) => {
      await client.query(
        `UPDATE devices SET deleted_at = NOW() WHERE id = $1 AND tenant_id = $2`,
        [deviceId, tenantId]
      );
    });
  }
}

export const deviceRepository = new DeviceRepository();
```

### 2.2 Create Media Repository (with S3 integration)

**File**: `backend/src/repositories/media.repository.ts`

```typescript
import { withPostgresConnection } from '../lib/postgres';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import { Logger } from '../lib/logger';

const logger = new Logger('MediaRepository');

interface Media {
  id: string;
  tenant_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  checksum_sha256: string;
  s3_url: string;
  s3_key: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'QUARANTINED';
  uploaded_by: string;
  created_at: Date;
  updated_at: Date;
}

export class MediaRepository {
  private s3Client: S3Client;
  private s3Bucket: string;

  constructor() {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
    });
    this.s3Bucket = process.env.S3_BUCKET || 'media-bucket';
  }

  /**
   * Check for duplicate media by checksum
   */
  async findByChecksum(
    tenantId: string,
    checksumSha256: string
  ): Promise<Media | null> {
    return withPostgresConnection(async (client) => {
      const result = await client.query(
        `SELECT * FROM media 
         WHERE tenant_id = $1 AND checksum_sha256 = $2 AND status = 'ACTIVE'
         LIMIT 1`,
        [tenantId, checksumSha256]
      );
      return result.rows[0] || null;
    });
  }

  /**
   * Calculate SHA256 checksum of buffer
   */
  calculateChecksum(buffer: Buffer): string {
    return crypto
      .createHash('sha256')
      .update(buffer)
      .digest('hex');
  }

  /**
   * Upload media to S3 and store metadata in PostgreSQL
   * PERMANENT STORAGE - No deletion/expiration
   */
  async uploadMedia(
    tenantId: string,
    filename: string,
    mimeType: string,
    buffer: Buffer,
    uploadedBy: string
  ): Promise<Media> {
    const checksum = this.calculateChecksum(buffer);

    // Check for duplicate
    const existing = await this.findByChecksum(tenantId, checksum);
    if (existing) {
      logger.info('Media already exists (deduplication)', {
        filename,
        checksum,
        existing_id: existing.id,
      });
      return existing;
    }

    const mediaId = crypto.randomUUID();
    const s3Key = `media/${tenantId}/${mediaId}`;
    const s3Url = `https://${this.s3Bucket}.s3.amazonaws.com/${s3Key}`;

    try {
      // Upload to S3
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.s3Bucket,
          Key: s3Key,
          Body: buffer,
          ContentType: mimeType,
          Metadata: {
            'tenant-id': tenantId,
            'uploaded-by': uploadedBy,
            'checksum-sha256': checksum,
          },
          ServerSideEncryption: 'AES256',
          StorageClass: 'STANDARD', // Can be STANDARD_IA after 30 days
        })
      );

      logger.info('Uploaded media to S3', {
        s3_key: s3Key,
        size_bytes: buffer.length,
      });

      // Store metadata in PostgreSQL
      return withPostgresConnection(async (client) => {
        const result = await client.query(
          `INSERT INTO media (id, tenant_id, filename, mime_type, size_bytes, 
                               checksum_sha256, s3_url, s3_key, status, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', $9)
           RETURNING *`,
          [
            mediaId,
            tenantId,
            filename,
            mimeType,
            buffer.length,
            checksum,
            s3Url,
            s3Key,
            uploadedBy,
          ]
        );

        logger.info('Media metadata stored in PostgreSQL', {
          media_id: mediaId,
          tenant_id: tenantId,
        });

        return result.rows[0] as Media;
      });
    } catch (error) {
      logger.error('Failed to upload media', error, {
        tenant_id: tenantId,
        filename,
      });
      throw error;
    }
  }

  /**
   * Get storage usage for tenant
   */
  async getStorageUsage(tenantId: string): Promise<{
    file_count: number;
    total_bytes: number;
    unique_files: number;
    dedup_rate_percent: number;
  }> {
    return withPostgresConnection(async (client) => {
      const result = await client.query(
        `SELECT 
           COUNT(DISTINCT id) as file_count,
           SUM(size_bytes) as total_bytes,
           COUNT(DISTINCT checksum_sha256) as unique_files,
           ROUND((COUNT(DISTINCT checksum_sha256)::float / COUNT(*)) * 100, 2) as dedup_rate_percent
         FROM media
         WHERE tenant_id = $1 AND status = 'ACTIVE'`,
        [tenantId]
      );

      const row = result.rows[0];
      return {
        file_count: parseInt(row.file_count, 10),
        total_bytes: parseInt(row.total_bytes || '0', 10),
        unique_files: parseInt(row.unique_files, 10),
        dedup_rate_percent: parseFloat(row.dedup_rate_percent || '0'),
      };
    });
  }
}

export const mediaRepository = new MediaRepository();
```

---

## Phase 3: Route Updates

### 3.1 Update Device Routes

**File**: `backend/src/routes/device.route.ts` (partial update)

```typescript
import { Router, Request, Response } from 'express';
import { deviceRepository } from '../repositories/device.repository';
import { Logger } from '../lib/logger';

const logger = new Logger('DeviceRoute');
const router = Router();

// Get all devices for tenant
router.get('/devices', async (req: Request, res: Response) => {
  try {
    const { tenant_id } = req.context!;

    // PostgreSQL query (RLS auto-filters by tenant)
    const devices = await deviceRepository.findByTenant(tenant_id);

    res.json({
      success: true,
      data: devices,
      count: devices.length,
    });
  } catch (error) {
    logger.error('Failed to fetch devices', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get device status summary (aggregation)
router.get('/devices/status-summary', async (req: Request, res: Response) => {
  try {
    const { tenant_id } = req.context!;

    const online = await deviceRepository.countByStatus(tenant_id, 'ONLINE');
    const offline = await deviceRepository.countByStatus(tenant_id, 'OFFLINE');
    const error = await deviceRepository.countByStatus(tenant_id, 'ERROR');

    res.json({
      online,
      offline,
      error,
      total: online + offline + error,
    });
  } catch (error) {
    logger.error('Failed to fetch device summary', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create device (called during pairing)
router.post('/devices', async (req: Request, res: Response) => {
  try {
    const { tenant_id, user_id } = req.context!;
    const { hardware_id, name, device_model, os_version } = req.body;

    // Validation
    if (!hardware_id || !name) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check for duplicate
    const existing = await deviceRepository.findByHardwareId(
      tenant_id,
      hardware_id
    );
    if (existing) {
      logger.warn('Device already exists', {
        tenant_id,
        hardware_id,
        existing_id: existing.id,
      });
      // Return existing device (idempotent)
      return res.json({ success: true, data: existing, created: false });
    }

    // Create device in PostgreSQL
    const device = await deviceRepository.create(tenant_id, {
      tenant_id,
      hardware_id,
      name,
      device_model,
      os_version,
      status: 'OFFLINE',
    });

    // Also write to MongoDB (dual-write for migration)
    try {
      const Device = mongoose.model('Device');
      await Device.create({
        tenant_id,
        hardware_id,
        name,
        device_model,
        os_version,
        status: 'OFFLINE',
        _id: device.id, // Use same ID for consistency
      });
    } catch (mongoError) {
      logger.warn('Failed to write device to MongoDB (dual-write)', mongoError);
      // Don't fail the request, PostgreSQL is primary
    }

    res.status(201).json({
      success: true,
      data: device,
      created: true,
    });
  } catch (error) {
    logger.error('Failed to create device', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
```

### 3.2 Update Media Routes

**File**: `backend/src/routes/content.route.ts` (partial update)

```typescript
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { mediaRepository } from '../repositories/media.repository';
import { Logger } from '../lib/logger';

const logger = new Logger('ContentRoute');
const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Upload media
router.post(
  '/media/upload',
  tenantContextMiddleware,
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      const { tenant_id, user_id } = req.context!;

      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      // Upload to S3 and store metadata in PostgreSQL
      const media = await mediaRepository.uploadMedia(
        tenant_id,
        req.file.originalname,
        req.file.mimetype,
        req.file.buffer,
        user_id
      );

      // Invalidate CDN cache if using CloudFront
      // (handled asynchronously in background job)

      res.status(201).json({
        success: true,
        data: media,
      });
    } catch (error) {
      logger.error('Failed to upload media', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Get storage usage (for display in dashboard)
router.get('/media/usage', async (req: Request, res: Response) => {
  try {
    const { tenant_id } = req.context!;

    const usage = await mediaRepository.getStorageUsage(tenant_id);

    res.json({
      success: true,
      data: usage,
    });
  } catch (error) {
    logger.error('Failed to get storage usage', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
```

---

## Phase 4: Telemetry Service Updates

### 4.1 Update Telemetry Recording (Dual-Write)

**File**: `backend/src/services/telemetry.service.ts` (updated)

```typescript
import { withPostgresConnection } from '../lib/postgres';
import { TelemetryEvent } from '../types/telemetry.types';
import { Logger } from '../lib/logger';
import mongoose from 'mongoose';

const logger = new Logger('TelemetryService');

export class TelemetryService {
  /**
   * Record telemetry event to both PostgreSQL (audit) and MongoDB (hot storage)
   * MongoDB: 90-day TTL for hot queries
   * PostgreSQL: audit_log for critical events
   */
  async recordTelemetry(event: TelemetryEvent): Promise<void> {
    const { tenant_id, device_id, correlation_id, kind, payload, timestamp } =
      event;

    try {
      // 1. Write to MongoDB (async, non-blocking)
      const telemetryCollection = mongoose
        .connection
        .collection('telemetry');

      telemetryCollection
        .insertOne({
          tenant_id,
          device_id,
          correlation_id,
          kind,
          payload,
          timestamp: new Date(timestamp),
        })
        .catch(err =>
          logger.error('Failed to insert telemetry to MongoDB', err, {
            correlation_id,
          })
        );

      // 2. For critical events, also append to PostgreSQL audit_log
      if (
        ['COMMAND_ACK', 'PLAYBACK_ERROR', 'DEVICE_OFFLINE'].includes(kind)
      ) {
        await withPostgresConnection(async client => {
          await client.query(
            `INSERT INTO audit_log 
             (tenant_id, action, resource_type, resource_id, change, correlation_id, timestamp)
             VALUES ($1, 'TELEMETRY_RECEIVED', 'Telemetry', $2, $3, $4, $5)`,
            [
              tenant_id,
              device_id,
              JSON.stringify(payload),
              correlation_id,
              new Date(timestamp),
            ]
          );
        });
      }

      logger.debug('Telemetry recorded', {
        kind,
        correlation_id,
        device_id,
      });
    } catch (error) {
      logger.error('Failed to record telemetry', error, {
        kind,
        correlation_id,
      });
      // Don't throw - telemetry failures shouldn't break app
    }
  }

  /**
   * Get telemetry timeline for device (last 7 days)
   */
  async getDeviceTimeline(
    tenantId: string,
    deviceId: string,
    limit: number = 100
  ): Promise<any[]> {
    // Telemetry queries come from MongoDB (hot data)
    const telemetryCollection = mongoose.connection.collection('telemetry');

    const events = await telemetryCollection
      .find({
        tenant_id: tenantId,
        device_id: deviceId,
        timestamp: {
          $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();

    return events;
  }
}

export const telemetryService = new TelemetryService();
```

---

## Phase 5: Command Dispatch Service

### 5.1 Update Command Service for PostgreSQL

**File**: `backend/src/services/command.service.ts` (new file)

```typescript
import { withPostgresConnection } from '../lib/postgres';
import { Logger } from '../lib/logger';
import Redis from 'ioredis';

const logger = new Logger('CommandService');

interface Command {
  id: string;
  tenant_id: string;
  device_id: string;
  correlation_id: string;
  command_type: string;
  status: 'PENDING' | 'DISPATCHED' | 'ACKNOWLEDGED' | 'COMPLETED' | 'FAILED';
  priority: number;
  payload: any;
  created_at: Date;
  dispatched_at?: Date;
  acknowledged_at?: Date;
  completed_at?: Date;
}

export class CommandService {
  private redis: Redis;

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    });
  }

  /**
   * Create command in PostgreSQL
   */
  async createCommand(
    tenantId: string,
    deviceId: string,
    commandType: string,
    payload: any,
    priority: number = 0
  ): Promise<Command> {
    return withPostgresConnection(async client => {
      const correlationId = crypto.randomUUID();

      const result = await client.query(
        `INSERT INTO commands 
         (tenant_id, device_id, correlation_id, command_type, status, priority, payload, created_at)
         VALUES ($1, $2, $3, $4, 'PENDING', $5, $6, NOW())
         RETURNING *`,
        [tenantId, deviceId, correlationId, commandType, priority, JSON.stringify(payload)]
      );

      logger.info('Command created', {
        command_id: result.rows[0].id,
        command_type: commandType,
        correlation_id: correlationId,
      });

      return result.rows[0] as Command;
    });
  }

  /**
   * Dispatch command to device via Socket.IO or push notification
   */
  async dispatchCommand(commandId: string): Promise<void> {
    return withPostgresConnection(async client => {
      const result = await client.query(
        `UPDATE commands 
         SET status = 'DISPATCHED', dispatched_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [commandId]
      );

      if (result.rows.length === 0) {
        logger.warn('Command not found for dispatch', { command_id: commandId });
        return;
      }

      const command = result.rows[0];

      // Queue for delivery (Redis)
      await this.redis.lpush(
        `command-queue:${command.device_id}`,
        JSON.stringify(command)
      );

      logger.info('Command queued for dispatch', {
        device_id: command.device_id,
        command_type: command.command_type,
      });
    });
  }

  /**
   * Acknowledge command receipt from device
   */
  async acknowledgeCommand(
    commandId: string,
    deviceId: string,
    metadata?: any
  ): Promise<Command> {
    return withPostgresConnection(async client => {
      const result = await client.query(
        `UPDATE commands 
         SET status = 'ACKNOWLEDGED', acknowledged_at = NOW()
         WHERE id = $1 AND device_id = $2
         RETURNING *`,
        [commandId, deviceId]
      );

      if (result.rows.length === 0) {
        throw new Error(`Command ${commandId} not found`);
      }

      logger.info('Command acknowledged', {
        command_id: commandId,
        device_id: deviceId,
      });

      return result.rows[0] as Command;
    });
  }

  /**
   * Mark command as completed
   */
  async completeCommand(
    commandId: string,
    deviceId: string,
    result: any
  ): Promise<Command> {
    return withPostgresConnection(async client => {
      await client.query('BEGIN');

      try {
        // Update command
        const cmdResult = await client.query(
          `UPDATE commands 
           SET status = 'COMPLETED', completed_at = NOW()
           WHERE id = $1 AND device_id = $2
           RETURNING *`,
          [commandId, deviceId]
        );

        if (cmdResult.rows.length === 0) {
          throw new Error(`Command ${commandId} not found`);
        }

        // Log completion
        await client.query(
          `INSERT INTO audit_log 
           (tenant_id, action, resource_type, resource_id, change, timestamp)
           VALUES ($1, 'COMMAND_COMPLETE', 'Command', $2, $3, NOW())`,
          [
            cmdResult.rows[0].tenant_id,
            commandId,
            JSON.stringify(result),
          ]
        );

        await client.query('COMMIT');

        logger.info('Command completed', {
          command_id: commandId,
          device_id: deviceId,
        });

        return cmdResult.rows[0] as Command;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  /**
   * Get pending commands for device
   */
  async getPendingCommands(deviceId: string): Promise<Command[]> {
    return withPostgresConnection(async client => {
      const result = await client.query(
        `SELECT * FROM commands 
         WHERE device_id = $1 AND status IN ('PENDING', 'DISPATCHED')
         ORDER BY priority DESC, created_at ASC
         LIMIT 100`,
        [deviceId]
      );

      return result.rows as Command[];
    });
  }
}

export const commandService = new CommandService();
```

---

## Phase 6: Application Startup

### 6.1 Update App Initialization

**File**: `backend/src/app.ts` (partial update)

```typescript
import express from 'express';
import { initializePostgres, closePostgres } from './lib/postgres';
import { tenantContextMiddleware } from './middlewares/tenant-context.middleware';
import mongoose from 'mongoose';

const app = express();

// Initialization
async function initializeApp() {
  try {
    // Connect to PostgreSQL
    await initializePostgres();
    logger.info('PostgreSQL initialized');

    // Connect to MongoDB (for telemetry)
    await mongoose.connect(process.env.MONGO_URI!);
    logger.info('MongoDB initialized');

    // Middleware
    app.use(express.json());
    app.use(authMiddleware); // Validate JWT
    app.use(tenantContextMiddleware); // Set PostgreSQL tenant context

    // Routes
    app.use('/api/devices', deviceRoutes);
    app.use('/api/content', contentRoutes);
    app.use('/api/commands', commandRoutes);

    // Error handling
    app.use(globalErrorHandler);

    return app;
  } catch (error) {
    logger.error('Failed to initialize app', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await closePostgres();
  await mongoose.disconnect();
  process.exit(0);
});

export default initializeApp();
```

---

## Phase 7: Completion Update (2026-04-02)

- `backend/src/repositories/content.repository.ts` now includes resilient read APIs:
  - `getMedia`, `listMedia`, `getPlaylist`, `listPlaylists`
- `backend/src/routes/content.route.ts` now serves `GET /playlists` with percentage-based PostgreSQL dual-read and MongoDB fallback
- `backend/src/app.ts` passes `readFromPostgresPercentage` into `buildContentRouter(...)`
- Content route shadow write failures are now logged via structured `Logger` (no `console.error`)
- Validation: `npm run lint -w backend` and `npm test -w backend` passed (11/11)

## Phase 8: Completion Update (2026-04-02)

- `backend/src/config/env.ts` now provides environment-based defaults for PostgreSQL read percentage:
  - `development` => 100
  - `staging` => 50
  - `production` => 10
- Explicit `READ_FROM_POSTGRES_PERCENTAGE` env var still overrides defaults when set
- Validation: `npm run lint -w backend` and `npm test -w backend` passed (11/11)

## Phase 7: Testing Checklist

- [ ] Unit tests for DeviceRepository (CRUD operations)
- [ ] Unit tests for MediaRepository (S3 upload, deduplication)
- [ ] Integration tests for dual-write (PostgreSQL + MongoDB)
- [ ] Load test: 10K concurrent command creations
- [ ] Load test: 100K telemetry events/second
- [ ] RLS tests (verify tenant isolation)
- [ ] Failover test (PostgreSQL read replica)
- [ ] Data consistency validation (compare PostgreSQL vs MongoDB records)

---

## Phase 8: Deployment Steps

1. **Create views/functions in PostgreSQL** (use `postgresql-schema-implementation.md`)
2. **Deploy code changes** to staging environment
3. **Enable dual-write** in `@routes` (write to both DBs)
4. **Validate data consistency** for 48 hours
5. **Enable dual-read** (read 10% from PostgreSQL)
6. **Monitor latency & errors** (should see <5% latency difference)
7. **Gradually increase PostgreSQL read percentage** (10% → 50% → 75% → 100%)
8. **Monitor**: No query timeouts, RLS enforced, audit log entries appearing
9. **Cutover**: Remove dual-write code, MongoDB becomes read-only archive
10. **Verify**: 30 days post-cutover, decommission MongoDB or keep as archive

---

## Environment Variables

```bash
# PostgreSQL
PG_HOST=remote-postgresql.rds.amazonaws.com
PG_PORT=5432
PG_DATABASE=remote_screen_prod
PG_USER=app_user
PG_PASSWORD=${SECRETS_MANAGER_PG_PASSWORD}
PG_POOL_SIZE=20

# MongoDB (for telemetry archival)
MONGO_URI=mongodb+srv://app_user:${SECRETS_MANAGER_MONGO_PASSWORD}@cluster.mongodb.net/remote_screen_telemetry

# Redis
REDIS_HOST=remote-redis.elasticache.amazonaws.com
REDIS_PORT=6379

# S3
AWS_REGION=us-east-1
S3_BUCKET=remote-screen-media-prod
S3_PREFIX=production/

# Feature flags (for gradual rollout)
READ_FROM_POSTGRES_PERCENTAGE=10 # Start at 10%, increase gradually
WRITE_TO_BOTH_DBS=true # Enable dual-write during migration
```

