// OrderItem Model - Món ăn trong đơn hàng
import mongoose, { Schema, Document } from "mongoose";
import { IOrderItem } from "../../types";

// Extend IOrderItem với Document
export interface IOrderItemDocument extends IOrderItem, Document {}

// Schema definition
const orderItemSchema = new Schema<IOrderItemDocument>(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: [true, "Order ID là bắt buộc"],
    },
    menuItemId: {
      type: Schema.Types.ObjectId,
      ref: "MenuItem",
      required: [true, "Menu Item ID là bắt buộc"],
    },
    quantity: {
      type: Number,
      default: 1,
      min: [1, "Số lượng phải lớn hơn 0"],
    },
    note: {
      type: String,
      default: "",
      maxlength: [200, "Ghi chú tối đa 200 ký tự"],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Index
orderItemSchema.index({ orderId: 1 });
orderItemSchema.index({ menuItemId: 1 });

// Export model
export const OrderItem = mongoose.model<IOrderItemDocument>(
  "OrderItem",
  orderItemSchema,
);
