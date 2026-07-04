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
  lastHeartbeatAt: Date | null;
  lastSeenAt: Date | null;
  ipAddress: string | null;
  playerVersion: string | null;
  osVersion: string | null;
  resolution: string | null;
  memoryTotal: string | null;
  memoryUsed: string | null;
};

const DeviceSchema = new Schema<DeviceDoc>(
  {
    tenantId: { type: String, required: false, default: null, index: true },
    hardwareId: { type: String, required: true, unique: true },
    name: { type: String, default: null },
    location: { type: String, default: null },
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
    timezone: { type: String, default: "Europe/Istanbul" },
    screenGroup: { type: String, default: "Ungrouped" },
    operatingHours: { type: String, default: "Always On" },
    scaleMode: { type: String, enum: ["fit", "fill", "stretch"], default: "fit" },
    notes: { type: String, default: "" },
    pairedOwnerUserId: { type: String, default: null },
    currentPlaylistId: { type: String, default: null },
    lastHeartbeatAt: { type: Date, default: null, index: true },
    lastSeenAt: { type: Date, default: null, index: true },
    ipAddress: { type: String, default: null },
    playerVersion: { type: String, default: null },
    osVersion: { type: String, default: null },
    resolution: { type: String, default: null },
    memoryTotal: { type: String, default: null },
    memoryUsed: { type: String, default: null }
  },
  { timestamps: true }
);

DeviceSchema.index({ tenantId: 1, pairedOwnerUserId: 1 });

export const DeviceModel = model<DeviceDoc>("Device", DeviceSchema);

