import { Schema, model } from "mongoose";

export type PlaylistItemDoc = {
  mediaId: string;
  filename: string;
  mediaUrl: string;
  checksumSha256: string;
  mimeType: string;
  durationMs: number;
  position: number;
};

export type PlaylistDoc = {
  tenantId: string;
  name: string;
  nameKey: string | null;
  creationKey: string | null;
  version: number;
  contentChecksumSha256: string;
  items: PlaylistItemDoc[];
  publishedAt: Date | null;
  publishedVersion: number | null;
  ownerUserId: string | null;
};

const PlaylistItemSchema = new Schema<PlaylistItemDoc>(
  {
    mediaId: { type: String, required: true, trim: true, maxlength: 64 },
    filename: { type: String, required: true, maxlength: 255 },
    mediaUrl: { type: String, required: true, maxlength: 4096 },
    checksumSha256: { type: String, required: true, lowercase: true, match: /^[0-9a-f]{64}$/ },
    mimeType: { type: String, required: true, maxlength: 100 },
    durationMs: { type: Number, required: true, min: 1000, max: 86400000 },
    position: { type: Number, required: true, min: 0, max: 499 }
  },
  { _id: false }
);

const PlaylistSchema = new Schema<PlaylistDoc>(
  {
    tenantId: { type: String, required: true, trim: true, maxlength: 64, index: true },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    nameKey: { type: String, default: null, trim: true, maxlength: 120 },
    creationKey: { type: String, default: null, trim: true, maxlength: 100 },
    version: { type: Number, required: true, default: 1, min: 1 },
    contentChecksumSha256: { type: String, required: false, default: "", match: /^$|^[0-9a-f]{64}$/ },
    items: { type: [PlaylistItemSchema], required: true, default: [], validate: [(items: PlaylistItemDoc[]) => items.length <= 500, "Playlist cannot exceed 500 items"] },
    publishedAt: { type: Date, default: null },
    publishedVersion: { type: Number, default: null, min: 1 },
    ownerUserId: { type: String, default: null, trim: true, maxlength: 64, index: true }
  },
  { timestamps: true }
);

PlaylistSchema.index(
  { tenantId: 1, ownerUserId: 1, nameKey: 1 },
  { unique: true, partialFilterExpression: { nameKey: { $type: "string" } } }
);
PlaylistSchema.index(
  { tenantId: 1, ownerUserId: 1, creationKey: 1 },
  { unique: true, partialFilterExpression: { creationKey: { $type: "string" } } }
);
PlaylistSchema.index({ tenantId: 1, nameKey: 1 });
PlaylistSchema.index({ tenantId: 1, updatedAt: -1 });
PlaylistSchema.index({ tenantId: 1, ownerUserId: 1, updatedAt: -1 });

export const PlaylistModel = model<PlaylistDoc>("Playlist", PlaylistSchema);
