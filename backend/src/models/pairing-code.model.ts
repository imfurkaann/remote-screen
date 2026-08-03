import { Schema, model } from "mongoose";

export type PairingCodeDoc = {
  deviceId: string;
  tenantId?: string | null;
  code: string;
  expiresAt: Date;
  consumedAt: Date | null;
  deviceCredentialHash: string;
  claimedAt: Date | null;
  claimedBy: string | null;
};

const PairingCodeSchema = new Schema<PairingCodeDoc>(
  {
    deviceId: { type: String, required: true, trim: true, maxlength: 64 },
    tenantId: { type: String, required: false, default: null, trim: true, maxlength: 64, index: true },
    code: { type: String, required: true, trim: true, match: /^[0-9]{6}$/ },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
    deviceCredentialHash: { type: String, required: true, match: /^[a-f0-9]{64}$/i, select: false },
    claimedAt: { type: Date, default: null },
    claimedBy: { type: String, default: null, trim: true, maxlength: 64 }
  },
  { timestamps: true }
);

PairingCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
PairingCodeSchema.index(
  { deviceId: 1 },
  { name: "unique_active_pairing_code_per_device", unique: true, partialFilterExpression: { consumedAt: null } }
);
PairingCodeSchema.index(
  { code: 1 },
  { name: "unique_active_pairing_code_value", unique: true, partialFilterExpression: { consumedAt: null } }
);

export const PairingCodeModel = model<PairingCodeDoc>("PairingCode", PairingCodeSchema);
