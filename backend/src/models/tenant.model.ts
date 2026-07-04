import { Schema, model } from "mongoose";

export type TenantDoc = {
  _id: string; // custom UUID string
  name: string;
  isActive: boolean;
};

const TenantSchema = new Schema<TenantDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    isActive: { type: Boolean, required: true, default: true }
  },
  { timestamps: true, _id: false }
);

export const TenantModel = model<TenantDoc>("Tenant", TenantSchema);
