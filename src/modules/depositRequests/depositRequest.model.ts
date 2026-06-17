import mongoose, { Schema, Document } from "mongoose";
import { IDepositRequest } from "../../types";

export interface IDepositRequestDocument extends Omit<IDepositRequest, "_id">, Document {}

const depositRequestSchema = new Schema<IDepositRequestDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID là bắt buộc"],
    },
    amount: {
      type: Number,
      required: [true, "Số tiền nạp là bắt buộc"],
      min: [1000, "Số tiền nạp tối thiểu là 1,000 VND"],
    },
    voucherCode: {
      type: String,
      default: "",
    },
    bonusAmount: {
      type: Number,
      default: 0,
      min: [0, "Số tiền thưởng không được âm"],
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    processedAt: {
      type: Date,
    },
    processedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

depositRequestSchema.index({ userId: 1 });
depositRequestSchema.index({ status: 1 });
depositRequestSchema.index({ requestedAt: -1 });

export const DepositRequest = mongoose.model<IDepositRequestDocument>(
  "DepositRequest",
  depositRequestSchema,
  "depositrequests"
);
