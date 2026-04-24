import { Request, Response, NextFunction } from "express";
import SystemConfig from "../models/SystemConfig";

/**
 * Middleware kiểm tra trạng thái bảo trì hệ thống
 * Cho phép Admin truy cập bình thường để sửa lỗi hoặc tắt bảo trì
 */
export const maintenanceMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // 1. Lấy cấu hình hệ thống (luôn lấy bản ghi đầu tiên hoặc duy nhất)
    const config = await SystemConfig.findOne();

    // 2. Nếu không có cấu hình hoặc không ở chế độ bảo trì -> Cho qua
    if (!config || !config.isMaintenance) {
      return next();
    }

    const now = new Date();

    // 2.1. Nếu có cài đặt thời gian, chỉ chặn nếu đang trong khoảng thời gian bảo trì
    if (config.maintenanceStart && now < new Date(config.maintenanceStart)) {
      return next(); // Chưa đến giờ bảo trì
    }

    if (config.maintenanceEnd && now > new Date(config.maintenanceEnd)) {
      return next(); // Đã qua giờ bảo trì
    }

    // 3. Nếu là Admin -> Cho qua (để admin có thể vào trang cấu hình tắt bảo trì)
    // Giả sử thông tin user đã được nạp bởi authMiddleware trước đó
    // Lưu ý: Middleware này nên đặt SAU authMiddleware nếu muốn kiểm tra role
    // Hoặc kiểm tra trực tiếp nếu request tới các route admin
    const user = (req as any).user;
    if (user && user.role === "admin") {
      return next();
    }

    // 4. Nếu là route public lấy cấu hình hệ thống -> Cho qua (để frontend biết đang bảo trì)
    if (req.path === "/api/system/config") {
        return next();
    }

    // 5. Các trường hợp còn lại -> Trả về lỗi bảo trì
    return res.status(503).json({
      success: false,
      isMaintenance: true,
      maintenanceEnd: config.maintenanceEnd,
      message: config.maintenanceMessage || "Hệ thống đang bảo trì",
    });
  } catch (error) {
    next(error);
  }
};
