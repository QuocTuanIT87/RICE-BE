import mongoose, { Schema, Document } from "mongoose";
import { IUserMembership } from "../../types";

export interface IUserMembershipDocument extends Omit<IUserMembership, "_id">, Document {}

const userMembershipSchema = new Schema<IUserMembershipDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    vipPackageId: { type: Schema.Types.ObjectId, ref: "VipPackage", required: true },
    activatedAt: { type: Date, required: true, default: Date.now },
    expiresAt: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false }
);

// Index to quickly search for active user membership
userMembershipSchema.index({ userId: 1, isActive: 1, expiresAt: 1 });

export const UserMembership = mongoose.model<IUserMembershipDocument>("UserMembership", userMembershipSchema, "usermemberships");
