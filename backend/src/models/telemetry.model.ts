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
    tenantId: { type: String, required: true, index: true },
    deviceId: { type: String, required: true, index: true },
    kind: { type: String, required: true, enum: TELEMETRY_KINDS, index: true },
    correlationId: { type: String, required: true, index: true },
    payload: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

TelemetrySchema.index({ tenantId: 1, deviceId: 1, kind: 1, createdAt: -1 });

export const TelemetryModel = model<TelemetryDoc>("Telemetry", TelemetrySchema);
