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
    // 1. Thử lấy token từ header (ưu tiên cao nhất)
    const authHeader = req.headers.authorization;
    let token = "";

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }
    // 2. Nếu không có header, thử lấy từ cookie
    else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      throw new ServiceError("NO_TOKEN", "Không có token xác thực", 401);
    }

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
 * Middleware xác thực token "mềm"
 * Cố gắng nạp user vào request nếu có token, nhưng không báo lỗi nếu không có
 */
export const softAuth = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;
    let token = "";

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (token) {
      const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      (req as any).user = decoded;
    }
    
    next();
  } catch (error) {
    // Không quan tâm lỗi ở đây
    next();
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
