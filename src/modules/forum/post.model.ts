import mongoose, { Schema, Document } from "mongoose";
import { IPost } from "../../types";

export interface IPostDocument extends Omit<IPost, "_id">, Document {}

const postSchema = new Schema<IPostDocument>(
  {
    title: { type: String, required: [true, "Tiêu đề bài viết là bắt buộc"], trim: true, maxlength: 200 },
    content: { type: String, required: [true, "Nội dung bài viết là bắt buộc"], trim: true },
    category: { type: String, required: [true, "Danh mục bài viết là bắt buộc"], trim: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    likes: [{ type: Schema.Types.ObjectId, ref: "User" }],
    reactions: [{
      userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
      type: { type: String, enum: ["like", "love", "haha", "wow", "sad", "angry"], required: true }
    }],
    imageUrl: { type: String, default: null },
  },
  { timestamps: true, versionKey: false }
);

postSchema.index({ createdAt: -1 });
postSchema.index({ category: 1 });

export const Post = mongoose.model<IPostDocument>("Post", postSchema, "posts");
