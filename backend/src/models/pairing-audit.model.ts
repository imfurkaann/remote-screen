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
    tenantId: { type: String, required: true, index: true },
    deviceId: { type: String, default: null, index: true },
    hardwareId: { type: String, default: null, index: true },
    eventType: {
      type: String,
      enum: [
        "PAIRING_CODE_REQUESTED",
        "PAIRING_CONFIRMED",
        "PAIRING_CONFIRM_FAILED",
        "DEVICE_SESSION_REFRESHED"
      ],
      required: true,
      index: true
    },
    actorType: { type: String, enum: ["device", "user", "system"], required: true },
    actorId: { type: String, default: null },
    result: { type: String, enum: ["success", "failure"], required: true },
    reason: { type: String, default: null }
  },
  { timestamps: true }
);

export const PairingAuditModel = model<PairingAuditDoc>("PairingAudit", PairingAuditSchema);
