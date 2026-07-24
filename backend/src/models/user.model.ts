import { Schema, model } from "mongoose";

export type UserDoc = {
  tenantId: string;
  email: string;
  passwordHash: string;
  role: "super_admin" | "tenant_owner" | "tenant_admin" | "operator" | "viewer";
  displayName: string;
  isActive: boolean;
  deactivatedAt: Date | null;
  deactivatedByUserId: string | null;
};

const UserSchema = new Schema<UserDoc>(
  {
    tenantId: { type: String, required: true, trim: true, maxlength: 64, index: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, minlength: 3, maxlength: 254 },
    passwordHash: { type: String, required: true, minlength: 40, maxlength: 255, select: false },
    role: {
      type: String,
      enum: ["super_admin", "tenant_owner", "tenant_admin", "operator", "viewer"],
      required: true
    },
    displayName: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    isActive: { type: Boolean, required: true, default: true },
    deactivatedAt: { type: Date, default: null },
    deactivatedByUserId: { type: String, default: null, trim: true, maxlength: 64 }
  },
  { timestamps: true }
);

UserSchema.index({ tenantId: 1, isActive: 1, createdAt: -1 });
UserSchema.index({ tenantId: 1, displayName: 1 });
UserSchema.index({ tenantId: 1, role: 1, isActive: 1 });

export const UserModel = model<UserDoc>("User", UserSchema);
