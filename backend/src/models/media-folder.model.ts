import { Schema, model } from "mongoose";

export type MediaFolderDoc = {
  tenantId: string;
  ownerUserId: string;
  name: string;
};

const MediaFolderSchema = new Schema<MediaFolderDoc>(
  {
    tenantId: { type: String, required: true, index: true },
    ownerUserId: { type: String, required: true, index: true },
    name: { type: String, required: true }
  },
  { timestamps: true }
);

MediaFolderSchema.index({ tenantId: 1, ownerUserId: 1, name: 1 }, { unique: true });

export const MediaFolderModel = model<MediaFolderDoc>("MediaFolder", MediaFolderSchema);
