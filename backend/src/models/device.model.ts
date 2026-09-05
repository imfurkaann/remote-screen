import { Schema, model } from "mongoose";

export type DeviceStatus = "online" | "offline" | "degraded";

export type DeviceDoc = {
  tenantId: string | null;
  hardwareId: string;
  name: string | null;
  location: string | null;
  status: DeviceStatus;
  orientation: number;
  timezone: string;
  screenGroup: string;
  operatingHours: string;
  scaleMode: string;
  notes: string;
  pairedOwnerUserId: string | null;
  currentPlaylistId: string | null;
  currentMediaId: string | null;
  playbackStartedAt: Date | null;
  previewUrl: string | null;
  previewCapturedAt: Date | null;
  lastHeartbeatAt: Date | null;
  lastSeenAt: Date | null;
  screenOn: boolean | null;
  ipAddress: string | null;
  playerVersion: string | null;
  osVersion: string | null;
  resolution: string | null;
  memoryTotal: string | null;
  memoryUsed: string | null;
  diagnostics?: Record<string, any> | null;
  deviceCredentialHash?: string | null;
};

const DeviceSchema = new Schema<DeviceDoc>(
  {
    tenantId: { type: String, required: false, default: null, trim: true, maxlength: 64, index: true },
    hardwareId: { type: String, required: true, trim: true, minlength: 1, maxlength: 255, unique: true },
    name: { type: String, default: null, trim: true, maxlength: 255 },
    location: { type: String, default: null, trim: true, maxlength: 255 },
    status: {
      type: String,
      enum: ["online", "offline", "degraded"],
      required: true,
      default: "offline"
    },
    orientation: {
      type: Number,
      enum: [0, 90, 180, 270],
      default: 0
    },
    timezone: { type: String, default: "Europe/Istanbul", trim: true, maxlength: 100 },
    screenGroup: { type: String, default: "Ungrouped", trim: true, maxlength: 120 },
    operatingHours: { type: String, default: "Always On", trim: true, maxlength: 255 },
    scaleMode: { type: String, enum: ["fit", "fill", "stretch"], default: "fit" },
    notes: { type: String, default: "", maxlength: 4000 },
    pairedOwnerUserId: { type: String, default: null, trim: true, maxlength: 64 },
    currentPlaylistId: { type: String, default: null, trim: true, maxlength: 64 },
    currentMediaId: { type: String, default: null, trim: true, maxlength: 64 },
    playbackStartedAt: { type: Date, default: null },
    previewUrl: { type: String, default: null, trim: true, maxlength: 4096 },
    previewCapturedAt: { type: Date, default: null },
    lastHeartbeatAt: { type: Date, default: null, index: true },
    lastSeenAt: { type: Date, default: null, index: true },
    screenOn: { type: Boolean, default: null },
    ipAddress: { type: String, default: null, trim: true, maxlength: 64 },
    playerVersion: { type: String, default: null, trim: true, maxlength: 64 },
    osVersion: { type: String, default: null, trim: true, maxlength: 128 },
    resolution: { type: String, default: null, trim: true, maxlength: 64 },
    memoryTotal: { type: String, default: null, trim: true, maxlength: 64 },
    memoryUsed: { type: String, default: null, trim: true, maxlength: 64 },
    diagnostics: { type: Schema.Types.Mixed, default: null },
    deviceCredentialHash: { type: String, default: null, select: false }
  },
  { timestamps: true }
);

DeviceSchema.index({ tenantId: 1, name: "text", hardwareId: "text", location: "text" });
DeviceSchema.index({ tenantId: 1, pairedOwnerUserId: 1 });
DeviceSchema.index({ tenantId: 1, status: 1, updatedAt: -1 });
DeviceSchema.index({ tenantId: 1, screenGroup: 1, updatedAt: -1 });
DeviceSchema.index({ tenantId: 1, status: 1, lastHeartbeatAt: 1 });

export const DeviceModel = model<DeviceDoc>("Device", DeviceSchema);
