import mongoose, { Schema, Document } from "mongoose";

export interface IVipCosmeticsDocument extends Document {
  userId: mongoose.Types.ObjectId;
  vipTheme: string;
  vipAvatarFrame: string;
  vipCoverImage: string;
  vipMascot: string;
  vipWebsiteName: string;
  vipWebsiteLogo: string;
  vipWebsiteBanner: string;
}

const vipCosmeticsSchema = new Schema<IVipCosmeticsDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    vipTheme: { type: String, default: "default" },
    vipAvatarFrame: { type: String, default: "none" },
    vipCoverImage: { type: String, default: "" },
    vipMascot: { type: String, default: "ronaldo" },
    vipWebsiteName: { type: String, default: "" },
    vipWebsiteLogo: { type: String, default: "" },
    vipWebsiteBanner: { type: String, default: "" },
  },
  { timestamps: true, versionKey: false }
);

vipCosmeticsSchema.index({ userId: 1 });

export const VipCosmetics = mongoose.model<IVipCosmeticsDocument>("VipCosmetics", vipCosmeticsSchema);
