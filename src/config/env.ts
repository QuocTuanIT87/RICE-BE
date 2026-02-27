// Cấu hình biến môi trường từ file .env
import dotenv from "dotenv";
dotenv.config();

// Interface định nghĩa kiểu cho các biến môi trường
interface EnvConfig {
  PORT: number;
  NODE_ENV: string;
  MONGODB_URI: string;
  JWT_SECRET: string;
<<<<<<< HEAD
  JWT_EXPIRES_IN: number;
  // Gmail OAuth2 API
  GMAIL_CLIENT_ID: string;
  GMAIL_CLIENT_SECRET: string;
  GMAIL_REFRESH_TOKEN: string;
  EMAIL_USER: string;
=======
  JWT_EXPIRES_IN: string;
  EMAIL_HOST: string;
  EMAIL_PORT: number;
  EMAIL_USER: string;
  EMAIL_PASS: string;
>>>>>>> 88316e3796a554084c42223fe02bd664f932e5f9
  FRONTEND_URL: string;
}

// Export cấu hình môi trường với giá trị mặc định
export const env: EnvConfig = {
  PORT: parseInt(process.env.PORT || "6000", 10),
  NODE_ENV: process.env.NODE_ENV || "development",
  MONGODB_URI: process.env.MONGODB_URI || "mongodb://localhost:27017/webdatcom",
  JWT_SECRET: process.env.JWT_SECRET || "default_jwt_secret",
<<<<<<< HEAD
  JWT_EXPIRES_IN: parseInt(process.env.JWT_EXPIRES_IN || "604800", 10), // 7 days in seconds
  // Gmail OAuth2 API
  GMAIL_CLIENT_ID: process.env.GMAIL_CLIENT_ID || "",
  GMAIL_CLIENT_SECRET: process.env.GMAIL_CLIENT_SECRET || "",
  GMAIL_REFRESH_TOKEN: process.env.GMAIL_REFRESH_TOKEN || "",
  EMAIL_USER: process.env.EMAIL_USER || "",
=======
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  EMAIL_HOST: process.env.EMAIL_HOST || "smtp.gmail.com",
  EMAIL_PORT: parseInt(process.env.EMAIL_PORT || "587", 10),
  EMAIL_USER: process.env.EMAIL_USER || "",
  EMAIL_PASS: process.env.EMAIL_PASS || "",
>>>>>>> 88316e3796a554084c42223fe02bd664f932e5f9
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:3000",
};
