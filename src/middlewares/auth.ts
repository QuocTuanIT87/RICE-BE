// Middleware xác thực JWT token
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config";
import { JwtPayload } from "../types";
import { ServiceError } from "./errors";

// Mở rộng Express Request để thêm user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Middleware xác thực token
 * Kiểm tra token từ header Authorization
 */
export const auth = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Lấy token từ header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new ServiceError("NO_TOKEN", "Không có token xác thực", 401);
    }

    // Tách token từ "Bearer <token>"
    const token = authHeader.split(" ")[1];

    // Verify token
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;

    // Gắn user info vào request
    (req as any).user = decoded;

    next();
  } catch (error) {
    if (error instanceof ServiceError) {
      next(error);
      return;
    }

    // Lỗi JWT (expired, invalid, etc.)
    next(
      new ServiceError(
        "INVALID_TOKEN",
        "Token không hợp lệ hoặc đã hết hạn",
        401,
      ),
    );
  }
};

/**
 * Middleware kiểm tra quyền admin
 * Phải dùng SAU middleware auth
 */
export const adminOnly = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const user = (req as any).user;
  if (!user) {
    next(new ServiceError("NO_TOKEN", "Không có token xác thực", 401));
    return;
  }

  if (user.role !== "admin") {
    next(
      new ServiceError("ADMIN_ONLY", "Chỉ admin mới có quyền thực hiện", 403),
    );
    return;
  }

  next();
};
