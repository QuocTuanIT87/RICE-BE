// Shared TypeScript interfaces cho toàn bộ ứng dụng
import { Types } from "mongoose";

// =============================================
// USER & AUTH TYPES
// =============================================

// Vai trò người dùng trong hệ thống
export type UserRole = "admin" | "user";

// Interface cho User document
export interface IUser {
  name: string;
  email: string;
  password: string;
  phone?: string; // Số điện thoại (tùy chọn)
  role: UserRole;
  isVerified: boolean; // Đã xác thực email chưa
  isBlocked: boolean; // Bị khóa tài khoản không
  otpCode?: string; // Mã OTP tạm thời
  otpExpiry?: Date; // Thời gian hết hạn OTP
  balance?: number; // Số dư ví tiền VND (tính từ Wallet model, gộp vào API)
  totalSpent?: number; // Tổng chi tiêu tích lũy (tính từ Vip model, gộp vào API)
  vipLevelCode?: string; // Mã hạng VIP (normal, silver, gold, diamond)
  vipLevelName?: string; // Tên hạng VIP
  vipDiscountRate?: number; // Phần trăm giảm giá VIP
  createdAt?: Date;
  updatedAt?: Date;
}

// Interface cho Wallet document
export interface IWallet {
  userId: Types.ObjectId;
  balance: number;
  createdAt?: Date;
  updatedAt?: Date;
}

// Interface cho VipLevel document
export interface IVipLevel {
  levelCode: string; // normal, silver, gold, diamond, etc.
  name: string;
  threshold: number;
  discountRate: number; // 0, 3, 6, 10
  createdAt?: Date;
  updatedAt?: Date;
}

// Interface cho Vip document
export interface IVip {
  userId: Types.ObjectId;
  totalSpent: number;
  vipLevelId: Types.ObjectId | IVipLevel;
  createdAt?: Date;
  updatedAt?: Date;
}

// Payload JWT token
export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
}

// Request có kèm user đã xác thực
export interface AuthRequest extends Request {
  user?: JwtPayload;
}

// =============================================
// DEPOSIT REQUEST TYPES
// =============================================

// Trạng thái yêu cầu nạp tiền
export type DepositStatus = "pending" | "approved" | "rejected";

// Interface cho yêu cầu nạp tiền
export interface IDepositRequest {
  _id: string;
  userId: Types.ObjectId;
  amount: number; // Số tiền nạp tự nhập (VND)
  status: DepositStatus;
  requestedAt: Date;
  processedAt?: Date;
  processedBy?: Types.ObjectId; // Admin xử lý
  voucherCode?: string; // Mã voucher áp dụng (nếu có)
  bonusAmount?: number; // Số tiền thưởng khuyến mãi từ voucher
  createdAt?: Date;
  updatedAt?: Date;
}

// =============================================
// MENU & ORDER TYPES
// =============================================

// Loại món ăn
export type MenuCategory = "new" | "daily" | "special";

// Interface cho menu theo ngày
export interface IDailyMenu {
  menuDate: Date; // Ngày của menu
  rawContent: string; // Nội dung gốc admin paste vào
  beginAt: string; // Giờ bắt đầu (HH:mm) - mặc định "10:00"
  endAt: string; // Giờ kết thúc (HH:mm) - mặc định "10:45"
  isLocked: boolean; // Admin đã khóa đặt cơm chưa
  createdBy: Types.ObjectId; // Admin tạo menu
  createdAt?: Date;
  updatedAt?: Date;
}

// Interface cho món ăn trong menu
export interface IMenuItem {
  dailyMenuId: Types.ObjectId;
  name: string; // Tên món ăn
  category: MenuCategory; // Phân loại món
  createdAt?: Date;
  updatedAt?: Date;
}

// Interface cho đơn đặt cơm
export interface IOrder {
  userId: Types.ObjectId;
  dailyMenuId: Types.ObjectId;
  orderType: "normal" | "no-rice"; // Loại đặt: có cơm hoặc không cơm
  isConfirmed: boolean; // Admin đã xác nhận chưa
  totalPrice?: number; // Tổng tiền của đơn đặt cơm (mới)
  voucherCode?: string; // Mã voucher áp dụng (nếu có)
  discountAmount?: number; // Số tiền được giảm từ voucher
  vipDiscountAmount?: number; // Số tiền được giảm từ đặc quyền VIP
  vipLevelAtOrder?: string; // Tên cấp độ VIP lúc đặt đơn
  orderedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

// Interface cho món ăn trong đơn hàng
export interface IOrderItem {
  orderId: Types.ObjectId;
  menuItemId: Types.ObjectId;
  quantity: number; // Số lượng
  note?: string; // Ghi chú của khách hàng
  createdAt?: Date;
  updatedAt?: Date;
}

// =============================================
// API RESPONSE TYPES
// =============================================

// Response chuẩn cho API
export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

// Pagination response
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}