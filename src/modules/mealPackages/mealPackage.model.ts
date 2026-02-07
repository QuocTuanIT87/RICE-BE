// MealPackage Model - Gói đặt cơm theo lượt (do admin tạo)
import mongoose, { Schema, Document } from "mongoose";
import { IMealPackage } from "../../types";

// Extend IMealPackage với Document
export interface IMealPackageDocument extends IMealPackage, Document {}

// Schema definition
const mealPackageSchema = new Schema<IMealPackageDocument>(
  {
    name: {
      type: String,
      required: [true, "Tên gói là bắt buộc"],
      trim: true,
      maxlength: [100, "Tên gói không được quá 100 ký tự"],
    },
    turns: {
      type: Number,
      required: [true, "Số lượt là bắt buộc"],
      min: [1, "Số lượt phải lớn hơn 0"],
    },
    price: {
      type: Number,
      required: [true, "Giá là bắt buộc"],
      min: [0, "Giá không được âm"],
    },
    validDays: {
      type: Number,
      required: [true, "Số ngày hiệu lực là bắt buộc"],
      min: [1, "Số ngày hiệu lực phải lớn hơn 0"],
      default: 30,
    },
    qrCodeImage: {
      type: String,
      default: "",
    },
    packageType: {
      type: String,
      enum: ["normal", "no-rice"],
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
mealPackageSchema.index({ isActive: 1 });
mealPackageSchema.index({ turns: 1 });

// Export model
export const MealPackage = mongoose.model<IMealPackageDocument>(
  "MealPackage",
  mealPackageSchema,
);
