// Voucher Model - Mã giảm giá
import mongoose, { Schema, Document } from "mongoose";

export interface IVoucher {
  code: string;
  description: string;
  discountType: "fixed" | "percentage";
  discountValue: number;
  minPurchase?: number;
  maxDiscount?: number;
  validFrom: Date;
  validTo: Date;
  usageLimit: number;
  usedCount: number;
  isActive: boolean;
  usedByUsers: string[]; // Danh sách IDs người dùng đã dùng mã này
  isPublic: boolean; // true: mọi người đều dùng được, false: chỉ người trong targetUsers
  targetUsers?: string[]; // Danh sách IDs người dùng được phép dùng (nếu isPublic = false)
}

export interface IVoucherDocument extends IVoucher, Document {}

const voucherSchema = new Schema<IVoucherDocument>(
  {
    code: {
      type: String,
      required: [true, "Mã voucher là bắt buộc"],
      unique: true,
      uppercase: true,
      trim: true,
    },
    description: {
      type: String,
      required: [true, "Mô tả là bắt buộc"],
    },
    discountType: {
      type: String,
      enum: ["fixed", "percentage"],
      default: "fixed",
    },
    discountValue: {
      type: Number,
      required: [true, "Giá trị giảm là bắt buộc"],
      min: 0,
    },
    minPurchase: {
      type: Number,
      default: 0,
    },
    maxDiscount: {
      type: Number,
    },
    validFrom: {
      type: Date,
      default: Date.now,
    },
    validTo: {
      type: Date,
      required: [true, "Ngày hết hạn là bắt buộc"],
    },
    usageLimit: {
      type: Number,
      default: 100,
    },
    usedCount: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    usedByUsers: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    isPublic: {
      type: Boolean,
      default: true,
    },
    targetUsers: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Index để tìm kiếm mã nhanh
voucherSchema.index({ validTo: 1 });

export const Voucher = mongoose.model<IVoucherDocument>("Voucher", voucherSchema);
