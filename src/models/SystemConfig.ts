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
  },
  { timestamps: true }
);

export default mongoose.model<ISystemConfig>("SystemConfig", SystemConfigSchema);
