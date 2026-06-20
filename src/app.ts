// Express App - Entry point
import express, { Application, Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import { env, connectDB } from "./config";
import { errorHandler } from "./middlewares";
import { socketService } from "./services/socketService";

// Import routes
import { authRoutes } from "./modules/auth";
import { usersRoutes } from "./modules/users";
import { depositRequestsRoutes } from "./modules/depositRequests";
import { dailyMenusRoutes } from "./modules/dailyMenus";
import { ordersRoutes } from "./modules/orders";
import { statisticsRoutes } from "./modules/statistics";
import voucherRoutes from "./modules/vouchers/vouchers.routes";
import { systemRoutes } from "./modules/system";
import { vipPackagesRoutes } from "./modules/vipPackages";
import { userMembershipsRoutes } from "./modules/userMemberships";
import { forumRoutes } from "./modules/forum";
import notificationsRoutes from "./modules/notifications/notifications.routes";
import socialRoutes from "./modules/social/social.routes";
import { chatRoutes } from "./modules/chat";
import { maintenanceMiddleware } from "./middlewares/maintenance";
import { softAuth, licenseMiddleware } from "./middlewares";

// Tạo app Express
const app: Application = express();
const httpServer = createServer(app);

// Middleware
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      env.FRONTEND_URL,
      /^https:\/\/(.+\.)?vercel\.app$/,
      /^https:\/\/(.+\.)?bluerabike\.com$/,
    ],
    credentials: true,
  })
);

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Chặn toàn bộ nếu không có License Key hợp lệ
app.use(licenseMiddleware);

// Khởi tạo Socket.io - dùng cùng CORS origins với Express
const socketCorsOrigins: (string | RegExp)[] = [
  "http://localhost:3000",
  env.FRONTEND_URL,
  /^https:\/\/(.+\.)?vercel\.app$/,
  /^https:\/\/(.+\.)?bluerabike\.com$/,
];
socketService.init(httpServer, socketCorsOrigins);

// Health check endpoint
app.get("/api/health", (req: Request, res: Response) => {
  res.json({
    success: true,
    status: "OK",
    timestamp: new Date(),
    environment: env.NODE_ENV,
    message: "🍚 Web Đặt Cơm API đang hoạt động thời gian thực!",
  });
});

// API Routes
app.use("/api/system", systemRoutes);

// Tự động nạp user nếu có token để middleware bảo trì biết ai là Admin
app.use(softAuth);
app.use(maintenanceMiddleware);

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/deposit-requests", depositRequestsRoutes);
app.use("/api/daily-menus", dailyMenusRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/statistics", statisticsRoutes);
app.use("/api/vip-packages", vipPackagesRoutes);
app.use("/api/user-memberships", userMembershipsRoutes);
app.use("/api/forum", forumRoutes);
app.use("/api/vouchers", voucherRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/social", socialRoutes);
app.use("/api/chat", chatRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: "Endpoint không tồn tại",
    },
  });
});

// Global error handler
app.use(errorHandler);

// Khởi động server
const startServer = async () => {
  try {
    // Kết nối database
    await connectDB();

    // Start server bằng httpServer để hỗ trợ Socket.io
    httpServer.listen(env.PORT, "0.0.0.0", () => {
      console.log(`
╔══════════════════════════════════════════════════════════╗
║                 🍚 WEB ĐẶT CƠM API 🍚                    ║
╠══════════════════════════════════════════════════════════╣
║  Server đang chạy tại: http://localhost:${env.PORT}           ║
║  Environment: ${env.NODE_ENV.padEnd(42)}║
║  Socket.io: Enabled                                      ║
╚══════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error("❌ Lỗi khởi động server:", error);
    process.exit(1);
  }
};

startServer();

export default app;