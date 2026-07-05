import mongoose, { Schema, Document } from "mongoose";
import { IStory } from "../../types";

export interface IStoryDocument extends Omit<IStory, "_id">, Document {}

const storySchema = new Schema<IStoryDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    imageUrl: { type: String, required: [true, "Hình ảnh story là bắt buộc"] },
    caption: { type: String, default: "" },
    musicTitle: { type: String, default: "" },
    musicUrl: { type: String, default: "" },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // Mặc định hết hạn sau 24h
    },
    views: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

// TTL Index tự động xóa bản ghi khi expiresAt nhỏ hơn thời gian hiện tại
storySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
storySchema.index({ userId: 1 });

export const Story = mongoose.model<IStoryDocument>("Story", storySchema, "stories");
