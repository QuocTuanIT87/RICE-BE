// UserPackage Model - Gói đặt cơm đã mua của user
import mongoose, { Schema, Document } from "mongoose";
import { IUserPackage } from "../../types";

// Extend IUserPackage với Document
export interface IUserPackageDocument extends IUserPackage, Document { }

// Schema definition
const userPackageSchema = new Schema<IUserPackageDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID là bắt buộc"],
    },
    mealPackageId: {
      type: Schema.Types.ObjectId,
      ref: "MealPackage",
      default: null, // null cho gói "coin-exchange" (đổi từ xu)
    },
    remainingTurns: {
      type: Number,
      required: true,
      min: [0, "Số lượt còn lại không được âm"],
    },
    purchasedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: [true, "Ngày hết hạn là bắt buộc"],
    },
    packageType: {
      type: String,
      enum: ["normal", "no-rice", "coin-exchange"],
      default: "normal",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Index
userPackageSchema.index({ userId: 1 });
userPackageSchema.index({ isActive: 1 });
userPackageSchema.index({ expiresAt: 1 });

// Export model
export const UserPackage = mongoose.model<IUserPackageDocument>(
  "UserPackage",
  userPackageSchema,
);
