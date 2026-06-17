// Seed Script - Tạo dữ liệu mẫu
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { env } from "../config";
import { User } from "../modules/auth/user.model";

const seed = async () => {
  try {
    console.log("🌱 Đang kết nối database...");
    await mongoose.connect(env.MONGODB_URI);
    console.log("✅ Đã kết nối MongoDB");

    // =============================================
    // Tạo Admin Account (nếu chưa có)
    // =============================================
    const existingAdmin = await User.findOne({ role: "admin" });

    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash("admin123", 12);

      const admin = new User({
        name: "Admin",
        email: "admin@webdatcom.local",
        password: hashedPassword,
        role: "admin",
        isVerified: true,
        isBlocked: false,
      });

      await admin.save();
      console.log("✅ Đã tạo tài khoản Admin");
      console.log("   Email: admin@webdatcom.local");
      console.log("   Password: admin123");
    } else {
      console.log("ℹ️ Tài khoản Admin đã tồn tại");
    }

    // =============================================
    // Tạo Customer Account (nếu chưa có)
    // =============================================
    const existingCustomer = await User.findOne({
      email: "khach@webdatcom.local",
    });

    if (!existingCustomer) {
      const hashedPassword = await bcrypt.hash("khach123", 12);

      const customer = new User({
        name: "Khách Hàng Test",
        email: "khach@webdatcom.local",
        password: hashedPassword,
        role: "user",
        isVerified: true,
        isBlocked: false,
      });

      await customer.save();
      console.log("✅ Đã tạo tài khoản Khách hàng");
      console.log("   Email: khach@webdatcom.local");
      console.log("   Password: khach123");
    } else {
      console.log("ℹ️ Tài khoản Khách hàng đã tồn tại");
    }

    console.log("\n🎉 Seed hoàn tất!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Lỗi seed:", error);
    process.exit(1);
  }
};

seed();
