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
    orderType: {
      type: String,
      enum: ["normal", "no-rice"],
      default: "normal",
    },
    totalPrice: {
      type: Number,
      default: 0,
      min: [0, "Tổng tiền không được âm"],
    },
    voucherCode: {
      type: String,
      default: "",
    },
    discountAmount: {
      type: Number,
      default: 0,
      min: [0, "Số tiền giảm không được âm"],
    },
    vipDiscountAmount: {
      type: Number,
      default: 0,
      min: [0, "Số tiền giảm VIP không được âm"],
    },
    vipLevelAtOrder: {
      type: String,
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
    isSettledWithRestaurant: {
      type: Boolean,
      default: false,
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