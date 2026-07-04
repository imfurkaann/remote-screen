import { Schema, model } from "mongoose";

export type PairingCodeDoc = {
  deviceId: string;
  tenantId?: string | null;
  code: string;
  expiresAt: Date;
  consumedAt: Date | null;
};

const PairingCodeSchema = new Schema<PairingCodeDoc>(
  {
    deviceId: { type: String, required: true, index: true },
    tenantId: { type: String, required: false, default: null, index: true },
    code: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

PairingCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PairingCodeModel = model<PairingCodeDoc>("PairingCode", PairingCodeSchema);
