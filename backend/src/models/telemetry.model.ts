import { Schema, model } from "mongoose";

export const TELEMETRY_KINDS = ["heartbeat", "playback", "sync", "command", "error"] as const;

export type TelemetryKind = (typeof TELEMETRY_KINDS)[number];

export type TelemetryDoc = {
  tenantId: string;
  deviceId: string;
  kind: TelemetryKind;
  correlationId: string;
  payload: Record<string, unknown>;
};

const TelemetrySchema = new Schema<TelemetryDoc>(
  {
    tenantId: { type: String, required: true, trim: true, maxlength: 64, index: true },
    deviceId: { type: String, required: true, trim: true, maxlength: 64, index: true },
    kind: { type: String, required: true, enum: TELEMETRY_KINDS, index: true },
    correlationId: { type: String, required: true, trim: true, maxlength: 128, index: true },
    payload: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

// ── Compound query index ────────────────────────────────────────────────────
// Optimises the most common access pattern: filtering telemetry for a specific
// device, optionally by kind, sorted by recency.
TelemetrySchema.index({ tenantId: 1, deviceId: 1, kind: 1, createdAt: -1 });

// ── Y4: TTL index — automatic 30-day expiry ─────────────────────────────────
// Without a TTL index a device with an unstable network (e.g. hotel Wi-Fi)
// can emit thousands of error events per day. Over weeks this grows the
// telemetry collection into hundreds of millions of documents, degrading
// MongoDB query performance and eventually exhausting disk space.
//
// MongoDB's TTL background thread runs approximately every 60 seconds and
// deletes documents whose `createdAt` field is older than 30 days
// (2_592_000 seconds). This is a server-side, zero-application-code operation.
//
// NOTE: If you need longer retention for compliance, increase expireAfterSeconds
// or route high-value telemetry to a cold-storage pipeline before this window.
TelemetrySchema.index({ createdAt: 1 }, { expireAfterSeconds: 2_592_000 }); // 30 days

export const TelemetryModel = model<TelemetryDoc>("Telemetry", TelemetrySchema);
