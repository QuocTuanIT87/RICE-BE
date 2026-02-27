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
<<<<<<< HEAD
=======
  phone?: string; // Số điện thoại (tùy chọn)
>>>>>>> 88316e3796a554084c42223fe02bd664f932e5f9
  role: UserRole;
  isVerified: boolean; // Đã xác thực email chưa
  isBlocked: boolean; // Bị khóa tài khoản không
  otpCode?: string; // Mã OTP tạm thời
  otpExpiry?: Date; // Thời gian hết hạn OTP
  activePackageId?: Types.ObjectId; // Gói đặt cơm đang sử dụng
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
// MEAL PACKAGE TYPES
// =============================================

// Loại gói đặt cơm: bình thường (có cơm) hoặc không cơm
export type PackageType = "normal" | "no-rice";

// Interface cho gói đặt cơm (do admin tạo)
export interface IMealPackage {
  name: string; // Tên gói: "Gói 5 lượt"
  turns: number; // Số lượt đặt cơm
  price: number; // Giá gói (VND)
  validDays: number; // Số ngày hiệu lực
  packageType: PackageType; // Loại gói: bình thường hoặc không cơm
  qrCodeImage?: string; // URL ảnh QR thanh toán
  isActive: boolean; // Còn bán không
  createdAt?: Date;
  updatedAt?: Date;
}

// Interface cho gói đã mua của user
export interface IUserPackage {
  userId: Types.ObjectId;
  mealPackageId: Types.ObjectId;
  packageType: PackageType; // Loại gói: bình thường hoặc không cơm
  remainingTurns: number; // Số lượt còn lại
  purchasedAt: Date; // Ngày mua
  expiresAt: Date; // Ngày hết hạn
  isActive: boolean; // Còn dùng được không
  createdAt?: Date;
  updatedAt?: Date;
}

// Trạng thái yêu cầu mua gói
export type PurchaseStatus = "pending" | "approved" | "rejected";

// Interface cho yêu cầu mua gói (chờ admin duyệt)
export interface IPackagePurchaseRequest {
  userId: Types.ObjectId;
  mealPackageId: Types.ObjectId;
  status: PurchaseStatus;
  requestedAt: Date;
  processedAt?: Date;
  processedBy?: Types.ObjectId; // Admin xử lý
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
  userPackageId: Types.ObjectId; // Gói dùng để đặt
  orderType: PackageType; // Loại đặt: có cơm hoặc không cơm
  isConfirmed: boolean; // Admin đã xác nhận chưa
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
