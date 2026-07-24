import { Schema, model } from "mongoose";

export type MediaStatus = "ready" | "failed";

export type MediaDoc = {
  tenantId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  storagePath: string;
  publicUrl: string;
  status: MediaStatus;
  appConfig?: Record<string, any>;
  ownerUserId: string | null;
  folder: string | null;
};

const MediaSchema = new Schema<MediaDoc>(
  {
    tenantId: { type: String, required: true, trim: true, maxlength: 64, index: true },
    filename: { type: String, required: true, trim: true, minlength: 1, maxlength: 255 },
    mimeType: { type: String, required: true, trim: true, maxlength: 100 },
    sizeBytes: { type: Number, required: true, min: 0, max: 2147483648 },
    checksumSha256: { type: String, required: true, lowercase: true, match: /^[0-9a-f]{64}$/ },
    storagePath: { type: String, required: true, maxlength: 4096 },
    publicUrl: { type: String, required: true, maxlength: 4096 },
    status: { type: String, enum: ["ready", "failed"], default: "ready", required: true },
    appConfig: { type: Schema.Types.Mixed, default: null },
    ownerUserId: { type: String, default: null, trim: true, maxlength: 64, index: true },
    folder: { type: String, default: null, trim: true, maxlength: 255 }
  },
  { timestamps: true }
);

MediaSchema.index({ tenantId: 1, checksumSha256: 1 });
MediaSchema.index(
  { tenantId: 1, ownerUserId: 1, checksumSha256: 1 },
  { unique: true, partialFilterExpression: { status: "ready" } }
);
MediaSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
MediaSchema.index({ tenantId: 1, ownerUserId: 1, status: 1, createdAt: -1 });
MediaSchema.index({ tenantId: 1, ownerUserId: 1, folder: 1, createdAt: -1 });

export const MediaModel = model<MediaDoc>("Media", MediaSchema);

