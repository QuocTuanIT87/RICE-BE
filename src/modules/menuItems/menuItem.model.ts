// MenuItem Model - Món ăn trong menu
import mongoose, { Schema, Document } from "mongoose";
import { IMenuItem } from "../../types";

// Extend IMenuItem với Document
export interface IMenuItemDocument extends IMenuItem, Document {}

// Schema definition
const menuItemSchema = new Schema<IMenuItemDocument>(
  {
    dailyMenuId: {
      type: Schema.Types.ObjectId,
      ref: "DailyMenu",
      required: [true, "Daily Menu ID là bắt buộc"],
    },
    name: {
      type: String,
      required: [true, "Tên món ăn là bắt buộc"],
      trim: true,
    },
    category: {
      type: String,
      enum: ["new", "daily", "special"],
      default: "daily",
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Index
menuItemSchema.index({ dailyMenuId: 1 });
menuItemSchema.index({ category: 1 });

// Export model
export const MenuItem = mongoose.model<IMenuItemDocument>(
  "MenuItem",
  menuItemSchema,
);
