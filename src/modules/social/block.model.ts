import mongoose, { Schema, Document } from "mongoose";

export interface IBlockDocument extends Document {
  blocker: mongoose.Types.ObjectId;
  blocked: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const blockSchema = new Schema<IBlockDocument>(
  {
    blocker: { type: Schema.Types.ObjectId, ref: "User", required: true },
    blocked: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true, versionKey: false }
);

// Compound index to guarantee uniqueness of blocks and speed up lookup queries
blockSchema.index({ blocker: 1, blocked: 1 }, { unique: true });
blockSchema.index({ blocked: 1 });

export const Block = mongoose.model<IBlockDocument>("Block", blockSchema);
