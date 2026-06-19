import mongoose, { Schema, Document } from "mongoose";
import { IVipPackage } from "../../types";

export interface IVipPackageDocument extends Omit<IVipPackage, "_id">, Document {}

const vipPackageSchema = new Schema<IVipPackageDocument>(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, required: true, min: 0 }, // Số tiền giảm cứng mỗi phần ăn (vd: 2000 VND)
    validDays: { type: Number, required: true, min: 1 },
    isActive: { type: Boolean, default: true },
    features: { type: [String], default: [] },
  },
  { timestamps: true, versionKey: false }
);

export const VipPackage = mongoose.model<IVipPackageDocument>("VipPackage", vipPackageSchema, "vippackages");
