import mongoose, { Schema, Document } from "mongoose";
import { IVip } from "../../types";

export interface IVipDocument extends IVip, Document {}

const vipSchema = new Schema<IVipDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    totalSpent: { type: Number, default: 0, min: 0 },
    vipLevelId: { type: Schema.Types.ObjectId, ref: "VipLevel", required: true },
  },
  { timestamps: true }
);

export const Vip = mongoose.model<IVipDocument>("Vip", vipSchema);
