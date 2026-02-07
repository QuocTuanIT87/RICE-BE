// Kết nối MongoDB Atlas
import mongoose from "mongoose";
import { env } from "./env";

// Hàm kết nối database
export const connectDB = async (): Promise<void> => {
  try {
    // Kết nối MongoDB với URI từ biến môi trường
    const conn = await mongoose.connect(env.MONGODB_URI);
    console.log(`✅ MongoDB đã kết nối: ${conn.connection.host}`);
  } catch (error) {
    console.error("❌ Lỗi kết nối MongoDB:", error);
    process.exit(1);
  }
};

// Xử lý sự kiện ngắt kết nối
mongoose.connection.on("disconnected", () => {
  console.log("⚠️ MongoDB đã ngắt kết nối");
});

// Xử lý tín hiệu tắt ứng dụng
process.on("SIGINT", async () => {
  await mongoose.connection.close();
  console.log("🔌 MongoDB đã đóng kết nối do ứng dụng tắt");
  process.exit(0);
});
