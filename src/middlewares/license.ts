import { Request, Response, NextFunction } from "express";
import { env } from "../config";

/**
 * Middleware kiểm tra bản quyền (License Key)
 * Nếu không có key hoặc key sai, sẽ chặn mọi truy cập API
 */
export const licenseMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Bỏ qua license check cho health check
  if (req.path === "/api/health") {
    return next();
  }

  // Key "bí mật" được nhúng trong code để đối chiếu
  const MASTER_KEY = "AIEBIKE-XAI-NGON-2026-PRO-MAX";

  if (!env.LICENSE_KEY || env.LICENSE_KEY !== MASTER_KEY) {
    return res.status(402).json({
      success: false,
      error: {
        code: "LICENSE_REQUIRED",
        message: "Hệ thống chưa được kích hoạt bản quyền hoặc key đã hết hạn. Vui lòng liên hệ nhà phát triển để tiếp tục sử dụng.",
      },
    });
  }

  next();
};
