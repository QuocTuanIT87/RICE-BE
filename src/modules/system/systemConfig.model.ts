import mongoose, { Schema, Document } from "mongoose";

export interface ISystemConfig extends Document {
  isMaintenance: boolean;
  maintenanceStart?: Date;
  maintenanceEnd?: Date;
  maintenanceMessage?: string;
  websiteName: string;
  websiteLogo?: string;
  websiteBanner?: string;
  contactPhone?: string;
  priceNormal: number;
  priceNoRice: number;
  bankId: string;
  bankAccountNo: string;
  bankAccountName: string;
  restaurantBankId?: string;
  restaurantBankAccountNo?: string;
  restaurantBankAccountName?: string;
}

const SystemConfigSchema: Schema = new Schema(
  {
    isMaintenance: { type: Boolean, default: false },
    maintenanceStart: { type: Date },
    maintenanceEnd: { type: Date },
    maintenanceMessage: { type: String, default: "Hệ thống đang bảo trì để nâng cấp dịch vụ. Vui lòng quay lại sau!" },
    websiteName: { type: String, default: "Thiên Hương Các" },
    websiteLogo: { type: String, default: "/logo.png" },
    websiteBanner: { type: String, default: "/banner.png" },
    contactPhone: { type: String, default: "0123.456.789" },
    priceNormal: { type: Number, default: 30000 },
    priceNoRice: { type: Number, default: 20000 },
    bankId: { type: String, default: "MB" },
    bankAccountNo: { type: String, default: "0999999999" },
    bankAccountName: { type: String, default: "NGUYEN VAN A" },
    restaurantBankId: { type: String, default: "MB" },
    restaurantBankAccountNo: { type: String, default: "0888888888" },
    restaurantBankAccountName: { type: String, default: "CHU QUAN COM" },
  },
  { timestamps: true }
);

export const SystemConfig = mongoose.model<ISystemConfig>("SystemConfig", SystemConfigSchema);
export default SystemConfig;
