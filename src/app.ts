// Express App - Entry point
import express, { Application, Request, Response } from "express";
import cors from "cors";
import { createServer } from "http";
import { env, connectDB } from "./config";
import { errorHandler } from "./middlewares";
import { socketService } from "./services";

// Import routes
import { authRoutes } from "./modules/auth";
import { usersRoutes } from "./modules/users";
import { mealPackagesRoutes } from "./modules/mealPackages";
import { packagePurchasesRoutes } from "./modules/packagePurchases";
import { userPackagesRoutes } from "./modules/userPackages";
import { dailyMenusRoutes } from "./modules/dailyMenus";
import { ordersRoutes } from "./modules/orders";
import { statisticsRoutes } from "./modules/statistics";

// Tạo app Express
const app: Application = express();
const httpServer = createServer(app);

// Middleware
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Khởi tạo Socket.io
socketService.init(httpServer, env.FRONTEND_URL);

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
app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/meal-packages", mealPackagesRoutes);
app.use("/api/package-purchases", packagePurchasesRoutes);
app.use("/api/user-packages", userPackagesRoutes);
app.use("/api/daily-menus", dailyMenusRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/statistics", statisticsRoutes);

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
    httpServer.listen(env.PORT, () => {
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
