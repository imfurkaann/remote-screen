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
  version: number;
  items: PlaylistItemDoc[];
  publishedAt: Date | null;
};

const PlaylistItemSchema = new Schema<PlaylistItemDoc>(
  {
    mediaId: { type: String, required: true },
    filename: { type: String, required: true },
    mediaUrl: { type: String, required: true },
    checksumSha256: { type: String, required: true },
    mimeType: { type: String, required: true },
    durationMs: { type: Number, required: true },
    position: { type: Number, required: true }
  },
  { _id: false }
);

const PlaylistSchema = new Schema<PlaylistDoc>(
  {
    tenantId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    version: { type: Number, required: true, default: 1 },
    items: { type: [PlaylistItemSchema], required: true, default: [] },
    publishedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

PlaylistSchema.index({ tenantId: 1, name: 1 });

export const PlaylistModel = model<PlaylistDoc>("Playlist", PlaylistSchema);
