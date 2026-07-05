// Shared TypeScript interfaces cho toàn bộ ứng dụng
import { Types } from "mongoose";

// =============================================
// USER & AUTH TYPES
// =============================================

// Vai trò người dùng trong hệ thống
export type UserRole = "admin" | "user";

export interface IVipCosmetics {
  userId: string;
  vipTheme: string;
  vipAvatarFrame: string;
  vipCoverImage: string;
  vipMascot: string;
  vipWebsiteName: string;
  vipWebsiteLogo: string;
  vipWebsiteBanner: string;
}

// Interface cho User document
export interface IUser {
  name: string;
  email: string;
  password: string;
  phone?: string; // Số điện thoại (tùy chọn)
  avatar?: string; // Ảnh đại diện của người dùng (tùy chọn)
  role: UserRole;
  isVerified: boolean; // Đã xác thực email chưa
  isBlocked: boolean; // Bị khóa tài khoản không
  otpCode?: string; // Mã OTP tạm thời
  otpExpiry?: Date; // Thời gian hết hạn OTP
  balance?: number; // Số dư ví tiền VND (tính từ Wallet model, gộp vào API)
  vipDiscountRate?: number; // Mức giảm giá hội viên/VIP (VND trên mỗi suất ăn hoặc % trước đây)
  vipCosmetics?: IVipCosmetics; // Các thiết lập trang trí VIP
  hasMembership?: boolean; // Có đang đăng ký VIP không
  membershipName?: string; // Tên gói VIP đang dùng
  membershipExpiresAt?: Date; // Ngày hết hạn gói VIP
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

// Interface cho VipPackage document
export interface IVipPackage {
  _id?: string;
  name: string;
  price: number;
  discountAmount: number; // Số tiền giảm cứng mỗi phần cơm (vd: 2000 VND)
  validDays: number;
  isActive: boolean;
  features: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

// Interface cho UserMembership document
export interface IUserMembership {
  _id?: string;
  userId: Types.ObjectId;
  vipPackageId: Types.ObjectId | IVipPackage;
  activatedAt: Date;
  expiresAt: Date;
  isActive: boolean;
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
  requestType?: "normal" | "buy_membership"; // Loại yêu cầu nạp
  vipPackageId?: Types.ObjectId; // ID gói VIP mua nếu là buy_membership
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
  isSettledWithRestaurant?: boolean; // Đã tất toán với quán cơm chưa
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

// =============================================
// COMMUNITY FORUM TYPES
// =============================================

export interface IReaction {
  userId: any;
  type: "like" | "love" | "haha" | "wow" | "sad" | "angry";
}

export interface IPost {
  _id?: string;
  title: string;
  content: string;
  category: string; // Tám chuyện, Review, Đời sống, Kiến thức
  userId: Types.ObjectId | any;
  likes: string[]; // Danh sách User IDs đã thích
  reactions?: IReaction[];
  commentsCount?: number;
  imageUrl?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IComment {
  _id?: string;
  postId: Types.ObjectId | string;
  userId: Types.ObjectId | any;
  content: string;
  parentId?: Types.ObjectId | string | null;
  reactions?: IReaction[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface INotification {
  _id?: string;
  userId: Types.ObjectId | any | null; // null means broadcast to all
  title: string;
  content: string;
  type: "system" | "gift" | "alert";
  isRead?: boolean; // private only
  readBy?: string[]; // user IDs list for broadcast notifications
  createdAt?: Date;
  updatedAt?: Date;
}