import mongoose, { Schema, Document } from "mongoose";

export interface IFollowDocument extends Document {
  follower: mongoose.Types.ObjectId;
  following: mongoose.Types.ObjectId;
  createdAt: Date;
}

const followSchema = new Schema<IFollowDocument>(
  {
    follower: { type: Schema.Types.ObjectId, ref: "User", required: true },
    following: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

// Compound index to guarantee uniqueness of follow relationship and query speed
followSchema.index({ follower: 1, following: 1 }, { unique: true });
followSchema.index({ following: 1 });

export const Follow = mongoose.model<IFollowDocument>("Follow", followSchema);
