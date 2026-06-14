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
    tenantId: { type: String, required: true, index: true },
    filename: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    checksumSha256: { type: String, required: true },
    storagePath: { type: String, required: true },
    publicUrl: { type: String, required: true },
    status: { type: String, enum: ["ready", "failed"], default: "ready", required: true },
    appConfig: { type: Schema.Types.Mixed, default: null },
    ownerUserId: { type: String, default: null, index: true },
    folder: { type: String, default: null }
  },
  { timestamps: true }
);

MediaSchema.index({ tenantId: 1, checksumSha256: 1 });
MediaSchema.index({ tenantId: 1, ownerUserId: 1, folder: 1 });

export const MediaModel = model<MediaDoc>("Media", MediaSchema);

