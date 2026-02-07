// Seed Script - Tạo dữ liệu mẫu
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { env } from "../config";
import { User } from "../modules/auth/user.model";
import { MealPackage } from "../modules/mealPackages/mealPackage.model";

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

    // =============================================
    // Tạo các gói đặt cơm mẫu (nếu chưa có)
    // =============================================
    const existingPackages = await MealPackage.countDocuments();

    if (existingPackages === 0) {
      const packages = [
        // Gói bình thường (có cơm) - 30k/lượt
        {
          name: "Gói 1 lượt",
          turns: 1,
          price: 35000,
          validDays: 7,
          packageType: "normal",
        },
        {
          name: "Gói 3 lượt",
          turns: 3,
          price: 100000,
          validDays: 14,
          packageType: "normal",
        },
        {
          name: "Gói 5 lượt",
          turns: 5,
          price: 160000,
          validDays: 21,
          packageType: "normal",
        },
        {
          name: "Gói 7 lượt",
          turns: 7,
          price: 220000,
          validDays: 30,
          packageType: "normal",
        },
        {
          name: "Gói 10 lượt",
          turns: 10,
          price: 300000,
          validDays: 45,
          packageType: "normal",
        },
        // Gói không cơm - 20k/lượt
        {
          name: "Gói 1 lượt (Không cơm)",
          turns: 1,
          price: 20000,
          validDays: 7,
          packageType: "no-rice",
        },
        {
          name: "Gói 3 lượt (Không cơm)",
          turns: 3,
          price: 55000,
          validDays: 14,
          packageType: "no-rice",
        },
        {
          name: "Gói 5 lượt (Không cơm)",
          turns: 5,
          price: 90000,
          validDays: 21,
          packageType: "no-rice",
        },
        {
          name: "Gói 7 lượt (Không cơm)",
          turns: 7,
          price: 125000,
          validDays: 30,
          packageType: "no-rice",
        },
        {
          name: "Gói 10 lượt (Không cơm)",
          turns: 10,
          price: 175000,
          validDays: 45,
          packageType: "no-rice",
        },
      ];

      await MealPackage.insertMany(packages);
      console.log("✅ Đã tạo 10 gói đặt cơm mẫu (5 bình thường + 5 không cơm)");
    } else {
      console.log("ℹ️ Các gói đặt cơm đã tồn tại");
    }

    console.log("\n🎉 Seed hoàn tất!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Lỗi seed:", error);
    process.exit(1);
  }
};

seed();
