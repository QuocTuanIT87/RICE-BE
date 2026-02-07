// DailyMenu Model - Menu theo ngày
import mongoose, { Schema, Document } from "mongoose";
import { IDailyMenu } from "../../types";

// Extend IDailyMenu với Document
export interface IDailyMenuDocument extends IDailyMenu, Document {}

// Schema definition
const dailyMenuSchema = new Schema<IDailyMenuDocument>(
  {
    menuDate: {
      type: Date,
      required: [true, "Ngày menu là bắt buộc"],
    },
    rawContent: {
      type: String,
      required: [true, "Nội dung menu là bắt buộc"],
    },
    beginAt: {
      type: String,
      default: "10:00",
    },
    endAt: {
      type: String,
      default: "10:45",
    },
    isLocked: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Người tạo menu là bắt buộc"],
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Virtual populate để lấy danh sách món ăn
dailyMenuSchema.virtual("menuItems", {
  ref: "MenuItem",
  localField: "_id",
  foreignField: "dailyMenuId",
});

// Index
dailyMenuSchema.index({ menuDate: -1 });
dailyMenuSchema.index({ isLocked: 1 });

// Export model
export const DailyMenu = mongoose.model<IDailyMenuDocument>(
  "DailyMenu",
  dailyMenuSchema,
);
