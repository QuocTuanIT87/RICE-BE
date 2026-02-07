// Script thêm gói không cơm
import mongoose from "mongoose";
import { env } from "../config";
import { MealPackage } from "../modules/mealPackages/mealPackage.model";

const addNoRicePackages = async () => {
  try {
    console.log("🌱 Đang kết nối database...");
    await mongoose.connect(env.MONGODB_URI);
    console.log("✅ Đã kết nối MongoDB");

    // Kiểm tra xem đã có gói không cơm chưa
    const existing = await MealPackage.findOne({ packageType: "no-rice" });

    if (!existing) {
      const noRicePackages = [
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

      await MealPackage.insertMany(noRicePackages);
      console.log("✅ Đã thêm 5 gói không cơm");
    } else {
      console.log("ℹ️ Gói không cơm đã tồn tại");
    }

    // Cập nhật các gói cũ thành normal nếu chưa có packageType
    const updated = await MealPackage.updateMany(
      { packageType: { $exists: false } },
      { $set: { packageType: "normal" } },
    );

    if (updated.modifiedCount > 0) {
      console.log(
        `✅ Đã cập nhật ${updated.modifiedCount} gói cũ thành 'normal'`,
      );
    }

    console.log("\n🎉 Hoàn tất!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Lỗi:", error);
    process.exit(1);
  }
};

addNoRicePackages();
