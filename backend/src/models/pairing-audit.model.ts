import { Schema, model } from "mongoose";

export type PairingAuditEventType =
  | "PAIRING_CODE_REQUESTED"
  | "PAIRING_CONFIRMED"
  | "PAIRING_CONFIRM_FAILED"
  | "DEVICE_SESSION_REFRESHED";

export type PairingAuditDoc = {
  tenantId: string;
  deviceId: string | null;
  hardwareId: string | null;
  eventType: PairingAuditEventType;
  actorType: "device" | "user" | "system";
  actorId: string | null;
  result: "success" | "failure";
  reason: string | null;
};

const PairingAuditSchema = new Schema<PairingAuditDoc>(
  {
    tenantId: { type: String, required: true, trim: true, maxlength: 64 },
    deviceId: { type: String, default: null, trim: true, maxlength: 64 },
    hardwareId: { type: String, default: null, trim: true, maxlength: 255 },
    eventType: {
      type: String,
      enum: [
        "PAIRING_CODE_REQUESTED",
        "PAIRING_CONFIRMED",
        "PAIRING_CONFIRM_FAILED",
        "DEVICE_SESSION_REFRESHED"
      ],
      required: true
    },
    actorType: { type: String, enum: ["device", "user", "system"], required: true },
    actorId: { type: String, default: null, trim: true, maxlength: 255 },
    result: { type: String, enum: ["success", "failure"], required: true },
    reason: { type: String, default: null, maxlength: 1000 }
  },
  { timestamps: true }
);

PairingAuditSchema.index({ tenantId: 1, createdAt: -1 });
PairingAuditSchema.index({ createdAt: 1 });
PairingAuditSchema.index({ tenantId: 1, deviceId: 1, createdAt: -1 });
PairingAuditSchema.index({ tenantId: 1, eventType: 1, createdAt: -1 });

export const PairingAuditModel = model<PairingAuditDoc>("PairingAudit", PairingAuditSchema);
