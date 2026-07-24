import { Schema, model } from "mongoose";

export type TenantDoc = {
  _id: string; // custom UUID string
  name: string;
  nameKey?: string;
  isActive: boolean;
};

const TenantSchema = new Schema<TenantDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    nameKey: { type: String, required: false, trim: true, maxlength: 120 },
    isActive: { type: Boolean, required: true, default: true }
  },
  { timestamps: true, _id: false }
);

TenantSchema.index({ nameKey: 1 }, { unique: true, sparse: true });
TenantSchema.index({ isActive: 1, createdAt: -1 });

export const TenantModel = model<TenantDoc>("Tenant", TenantSchema);
