// Global error handler middleware
import { Request, Response, NextFunction } from "express";
import { ServiceError } from "./errors";

// Middleware xử lý lỗi toàn cục
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  console.error("❌ Error:", err.message);

  // Xử lý ServiceError (lỗi đã định nghĩa)
  if (err instanceof ServiceError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    });
    return;
  }

  // Xử lý lỗi validation của Mongoose
  if (err.name === "ValidationError") {
    res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: err.message,
      },
    });
    return;
  }

  // Xử lý lỗi CastError (id không hợp lệ)
  if (err.name === "CastError") {
    res.status(400).json({
      success: false,
      error: {
        code: "INVALID_ID",
        message: "ID không hợp lệ",
      },
    });
    return;
  }

  // Lỗi không xác định
  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "Lỗi server, vui lòng thử lại sau",
    },
  });
};
