import { Schema, model } from "mongoose";

export type UserDoc = {
  tenantId: string;
  email: string;
  passwordHash: string;
  role: "tenant_owner" | "tenant_admin" | "operator" | "viewer";
  displayName: string;
  isActive: boolean;
};

const UserSchema = new Schema<UserDoc>(
  {
    tenantId: { type: String, required: true, index: true },
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ["tenant_owner", "tenant_admin", "operator", "viewer"],
      required: true
    },
    displayName: { type: String, required: true },
    isActive: { type: Boolean, required: true, default: true }
  },
  { timestamps: true }
);

UserSchema.index({ tenantId: 1, email: 1 });

export const UserModel = model<UserDoc>("User", UserSchema);
