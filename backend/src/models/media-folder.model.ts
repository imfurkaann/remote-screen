import { Schema, model } from "mongoose";

export type MediaFolderDoc = {
  tenantId: string;
  ownerUserId: string | null;
  name: string;
};

const MediaFolderSchema = new Schema<MediaFolderDoc>(
  {
    tenantId: { type: String, required: true, trim: true, maxlength: 64, index: true },
    ownerUserId: { type: String, required: false, default: null, trim: true, maxlength: 64, index: true },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 }
  },
  { timestamps: true }
);

MediaFolderSchema.index({ tenantId: 1, ownerUserId: 1, name: 1 }, { unique: true });

export const MediaFolderModel = model<MediaFolderDoc>("MediaFolder", MediaFolderSchema);
