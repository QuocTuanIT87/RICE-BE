import mongoose, { Schema, Document } from "mongoose";
import { IComment } from "../../types";

export interface ICommentDocument extends Omit<IComment, "_id">, Document {}

const commentSchema = new Schema<ICommentDocument>(
  {
    postId: { type: Schema.Types.ObjectId, ref: "Post", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, required: [true, "Nội dung bình luận là bắt buộc"], trim: true },
    parentId: { type: Schema.Types.ObjectId, ref: "Comment", default: null },
    reactions: [{
      userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
      type: { type: String, enum: ["like", "love", "haha", "wow", "sad", "angry"], required: true }
    }],
  },
  { timestamps: true, versionKey: false }
);

commentSchema.index({ postId: 1, createdAt: 1 });

export const Comment = mongoose.model<ICommentDocument>("Comment", commentSchema, "comments");
