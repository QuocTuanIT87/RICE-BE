import mongoose, { Schema, Document } from "mongoose";
import { INotification } from "../../types";

export interface INotificationDocument extends Omit<INotification, "_id">, Document {}

const notificationSchema = new Schema<INotificationDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null }, // Null means sent to everyone
    title: { type: String, required: [true, "Tiêu đề thông báo là bắt buộc"], trim: true },
    content: { type: String, required: [true, "Nội dung thông báo là bắt buộc"], trim: true },
    type: { type: String, enum: ["system", "gift", "alert"], default: "system" },
    isRead: { type: Boolean, default: false }, // Only for private notifications
    readBy: [{ type: Schema.Types.ObjectId, ref: "User" }], // For broadcast notifications
  },
  { timestamps: true, versionKey: false }
);

notificationSchema.index({ userId: 1, createdAt: -1 });

export const Notification = mongoose.model<INotificationDocument>(
  "Notification",
  notificationSchema,
  "notifications"
);
