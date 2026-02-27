// Order Model - Đơn đặt cơm
import mongoose, { Schema, Document } from "mongoose";
import { IOrder } from "../../types";

// Extend IOrder với Document
export interface IOrderDocument extends IOrder, Document { }

// Schema definition
const orderSchema = new Schema<IOrderDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID là bắt buộc"],
    },
    dailyMenuId: {
      type: Schema.Types.ObjectId,
      ref: "DailyMenu",
      required: [true, "Daily Menu ID là bắt buộc"],
    },
    userPackageId: {
      type: Schema.Types.ObjectId,
      ref: "UserPackage",
      required: [true, "User Package ID là bắt buộc"],
    },
    orderType: {
      type: String,
      enum: ["normal", "no-rice"],
      default: "normal",
    },
    isConfirmed: {
      type: Boolean,
      default: false,
    },
    orderedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Virtual populate để lấy danh sách món đã chọn
orderSchema.virtual("orderItems", {
  ref: "OrderItem",
  localField: "_id",
  foreignField: "orderId",
});

// Index - Mỗi user chỉ có 1 order cho 1 menu
orderSchema.index({ userId: 1, dailyMenuId: 1 }, { unique: true });
orderSchema.index({ dailyMenuId: 1 });
orderSchema.index({ isConfirmed: 1 });

// Export model
export const Order = mongoose.model<IOrderDocument>("Order", orderSchema);