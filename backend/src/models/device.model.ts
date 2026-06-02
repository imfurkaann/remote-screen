import { Schema, model } from "mongoose";

export type DeviceStatus = "online" | "offline" | "degraded";

export type DeviceDoc = {
  tenantId: string;
  hardwareId: string;
  name: string | null;
  location: string | null;
  status: DeviceStatus;
  pairedOwnerUserId: string | null;
  currentPlaylistId: string | null;
  lastHeartbeatAt: Date | null;
  lastSeenAt: Date | null;
};

const DeviceSchema = new Schema<DeviceDoc>(
  {
    tenantId: { type: String, required: true, index: true },
    hardwareId: { type: String, required: true, unique: true },
    name: { type: String, default: null },
    location: { type: String, default: null },
    status: {
      type: String,
      enum: ["online", "offline", "degraded"],
      required: true,
      default: "offline"
    },
    pairedOwnerUserId: { type: String, default: null },
    currentPlaylistId: { type: String, default: null },
    lastHeartbeatAt: { type: Date, default: null, index: true },
    lastSeenAt: { type: Date, default: null, index: true }
  },
  { timestamps: true }
);

export const DeviceModel = model<DeviceDoc>("Device", DeviceSchema);
