// Custom error class cho service layer
export class ServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

// Các lỗi thường gặp
export const Errors = {
  // Auth errors
  INVALID_CREDENTIALS: new ServiceError(
    "INVALID_CREDENTIALS",
    "Email hoặc mật khẩu không đúng",
    401,
  ),
  INVALID_PASSWORD: new ServiceError(
    "INVALID_PASSWORD",
    "Mật khẩu hiện tại không đúng",
    400,
  ),
  USER_NOT_FOUND: new ServiceError(
    "USER_NOT_FOUND",
    "Không tìm thấy người dùng",
    404,
  ),
  USER_BLOCKED: new ServiceError("USER_BLOCKED", "Tài khoản đã bị khóa", 403),
  USER_NOT_VERIFIED: new ServiceError(
    "USER_NOT_VERIFIED",
    "Tài khoản chưa được xác thực",
    403,
  ),
  EMAIL_EXISTS: new ServiceError("EMAIL_EXISTS", "Email đã được sử dụng", 400),
  INVALID_OTP: new ServiceError(
    "INVALID_OTP",
    "Mã OTP không đúng hoặc đã hết hạn",
    400,
  ),

  // Auth middleware errors
  NO_TOKEN: new ServiceError("NO_TOKEN", "Không có token xác thực", 401),
  INVALID_TOKEN: new ServiceError("INVALID_TOKEN", "Token không hợp lệ", 401),
  ADMIN_ONLY: new ServiceError(
    "ADMIN_ONLY",
    "Chỉ admin mới có quyền thực hiện",
    403,
  ),

  // Package errors
  PACKAGE_NOT_FOUND: new ServiceError(
    "PACKAGE_NOT_FOUND",
    "Không tìm thấy gói đặt cơm",
    404,
  ),
  NO_ACTIVE_PACKAGE: new ServiceError(
    "NO_ACTIVE_PACKAGE",
    "Bạn chưa có gói đặt cơm nào khả dụng",
    400,
  ),
  PACKAGE_EXPIRED: new ServiceError(
    "PACKAGE_EXPIRED",
    "Gói đặt cơm đã hết hạn",
    400,
  ),
  NO_TURNS_LEFT: new ServiceError(
    "NO_TURNS_LEFT",
    "Gói đặt cơm đã hết lượt",
    400,
  ),
  REQUEST_ALREADY_EXISTS: new ServiceError(
    "REQUEST_ALREADY_EXISTS",
    "Bạn đã có yêu cầu mua gói đang chờ xử lý",
    400,
  ),

  // Menu errors
  MENU_NOT_FOUND: new ServiceError(
    "MENU_NOT_FOUND",
    "Không tìm thấy menu",
    404,
  ),
  MENU_LOCKED: new ServiceError(
    "MENU_LOCKED",
    "Menu đã bị khóa, không thể đặt cơm",
    400,
  ),
  OUTSIDE_ORDER_TIME: new ServiceError(
    "OUTSIDE_ORDER_TIME",
    "Ngoài thời gian đặt cơm (10:00 - 10:45)",
    400,
  ),

  // Order errors
  ORDER_NOT_FOUND: new ServiceError(
    "ORDER_NOT_FOUND",
    "Không tìm thấy đơn hàng",
    404,
  ),
  ALREADY_ORDERED: new ServiceError(
    "ALREADY_ORDERED",
    "Bạn đã đặt cơm hôm nay rồi",
    400,
  ),
};
