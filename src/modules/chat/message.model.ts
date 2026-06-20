import mongoose, { Schema, Document } from "mongoose";

export interface IMessageReaction {
  userId: mongoose.Types.ObjectId;
  type: "like" | "love" | "haha" | "wow" | "sad" | "angry";
}

export interface IMessageDocument extends Document {
  senderId: mongoose.Types.ObjectId;
  receiverId: mongoose.Types.ObjectId;
  content: string;
  imageUrl?: string;
  isRead: boolean;
  isRecalled: boolean;
  reactions: IMessageReaction[];
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<IMessageDocument>(
  {
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    receiverId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, default: "", trim: true },
    imageUrl: { type: String },
    isRead: { type: Boolean, default: false },
    isRecalled: { type: Boolean, default: false },
    reactions: [
      {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        type: { type: String, enum: ["like", "love", "haha", "wow", "sad", "angry"], required: true }
      }
    ]
  },
  { timestamps: true }
);

// Indexes for fast query of conversation history
messageSchema.index({ senderId: 1, receiverId: 1, createdAt: -1 });
messageSchema.index({ receiverId: 1, senderId: 1, createdAt: -1 });

export const Message = mongoose.model<IMessageDocument>("Message", messageSchema);
export default Message;
