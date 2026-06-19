import mongoose, { Schema, Document } from "mongoose";
import { IVipLevel } from "../../types";

export interface IVipLevelDocument extends IVipLevel, Document {}

const vipLevelSchema = new Schema<IVipLevelDocument>(
  {
    levelCode: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    threshold: { type: Number, required: true, min: 0 },
    discountRate: { type: Number, required: true, min: 0, max: 100 },
  },
  { timestamps: true }
);

export const VipLevel = mongoose.model<IVipLevelDocument>("VipLevel", vipLevelSchema);
