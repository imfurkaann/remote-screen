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
    status: { type: String, enum: ["ready", "failed"], default: "ready", required: true }
  },
  { timestamps: true }
);

MediaSchema.index({ tenantId: 1, checksumSha256: 1 });

export const MediaModel = model<MediaDoc>("Media", MediaSchema);
