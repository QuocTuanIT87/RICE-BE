import mongoose, { Schema, Document } from "mongoose";
import { IWallet } from "../../types";

export interface IWalletDocument extends IWallet, Document {}

const walletSchema = new Schema<IWalletDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    balance: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

export const Wallet = mongoose.model<IWalletDocument>("Wallet", walletSchema);
