// PackagePurchaseRequest Model - Yêu cầu mua gói (chờ admin duyệt)
import mongoose, { Schema, Document } from "mongoose";
import { IPackagePurchaseRequest } from "../../types";

// Extend IPackagePurchaseRequest với Document
export interface IPackagePurchaseRequestDocument
  extends IPackagePurchaseRequest, Document {}

// Schema definition
const packagePurchaseRequestSchema =
  new Schema<IPackagePurchaseRequestDocument>(
    {
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: [true, "User ID là bắt buộc"],
      },
      mealPackageId: {
        type: Schema.Types.ObjectId,
        ref: "MealPackage",
        required: [true, "Meal Package ID là bắt buộc"],
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
    },
  );

// Index
packagePurchaseRequestSchema.index({ userId: 1 });
packagePurchaseRequestSchema.index({ status: 1 });
packagePurchaseRequestSchema.index({ requestedAt: -1 });

// Export model
export const PackagePurchaseRequest =
  mongoose.model<IPackagePurchaseRequestDocument>(
    "PackagePurchaseRequest",
    packagePurchaseRequestSchema,
  );
