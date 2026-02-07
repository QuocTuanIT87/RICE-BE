// Cấu hình biến môi trường từ file .env
import dotenv from "dotenv";
dotenv.config();

// Interface định nghĩa kiểu cho các biến môi trường
interface EnvConfig {
  PORT: number;
  NODE_ENV: string;
  MONGODB_URI: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  EMAIL_HOST: string;
  EMAIL_PORT: number;
  EMAIL_USER: string;
  EMAIL_PASS: string;
  FRONTEND_URL: string;
}

// Export cấu hình môi trường với giá trị mặc định
export const env: EnvConfig = {
  PORT: parseInt(process.env.PORT || "6000", 10),
  NODE_ENV: process.env.NODE_ENV || "development",
  MONGODB_URI: process.env.MONGODB_URI || "mongodb://localhost:27017/webdatcom",
  JWT_SECRET: process.env.JWT_SECRET || "default_jwt_secret",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  EMAIL_HOST: process.env.EMAIL_HOST || "smtp.gmail.com",
  EMAIL_PORT: parseInt(process.env.EMAIL_PORT || "587", 10),
  EMAIL_USER: process.env.EMAIL_USER || "",
  EMAIL_PASS: process.env.EMAIL_PASS || "",
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:3000",
};
