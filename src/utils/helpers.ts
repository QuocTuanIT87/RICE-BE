// Các hàm tiện ích dùng chung
import crypto from "crypto";

/**
 * Tạo mã OTP 6 chữ số ngẫu nhiên
 */
export const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Tạo thời gian hết hạn OTP (mặc định 10 phút)
 */
export const getOTPExpiry = (minutes: number = 10): Date => {
  return new Date(Date.now() + minutes * 60 * 1000);
};

/**
 * Kiểm tra OTP còn hiệu lực không
 */
export const isOTPValid = (expiry: Date): boolean => {
  return new Date() < new Date(expiry);
};

/**
 * Format số tiền VND
 */
export const formatVND = (amount: number): string => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(amount);
};

/**
 * Format ngày giờ theo định dạng Việt Nam
 */
export const formatDateVN = (date: Date): string => {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
};

/**
 * Lấy ngày bắt đầu của ngày hiện tại (00:00:00)
 */
export const getStartOfDay = (date: Date = new Date()): Date => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
};

/**
 * Lấy ngày kết thúc của ngày hiện tại (23:59:59)
 */
export const getEndOfDay = (date: Date = new Date()): Date => {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
};

/**
 * Parse chuỗi thời gian HH:mm thành Date object
 */
export const parseTimeString = (
  timeStr: string,
  baseDate: Date = new Date(),
): Date => {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const result = new Date(baseDate);
  result.setHours(hours, minutes, 0, 0);
  return result;
};

/**
 * Kiểm tra thời gian hiện tại có nằm trong khoảng cho phép không
 */
export const isWithinTimeRange = (beginAt: string, endAt: string): boolean => {
  const now = new Date();
  const begin = parseTimeString(beginAt);
  const end = parseTimeString(endAt);
  return now >= begin && now <= end;
};

/**
 * Parse menu text thành danh sách món ăn
 * Tách theo dấu phẩy và các ký tự đặc biệt
 */
export const parseMenuText = (
  text: string,
): { name: string; category: string }[] => {
  const items: { name: string; category: string }[] = [];
  let currentCategory = "daily";

  // Tách theo dòng
  const lines = text.split("\n");

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Xác định category dựa trên marker
    if (trimmedLine.includes("MÓN MỚI")) {
      currentCategory = "new";
      continue;
    } else if (trimmedLine.includes("MÓN MỖI NGÀY")) {
      currentCategory = "daily";
      continue;
    } else if (trimmedLine.includes("MÓN ĐẶC BIỆT")) {
      currentCategory = "special";
      continue;
    }

    // Loại bỏ các marker không cần thiết
    let cleanLine = trimmedLine
      .replace(/^[☆▪︎•\-\s]+/, "") // Bỏ ký tự đầu dòng
      .replace(/^[A-Za-z\/]+\s*đặt\s+cơm.*$/i, "") // Bỏ dòng "A/C đặt cơm..."
      .trim();

    if (!cleanLine) continue;

    // Tách món ăn bởi dấu phẩy
    const dishes = cleanLine
      .split(",")
      .map((d) => d.trim())
      .filter((d) => d.length > 0);

    for (const dish of dishes) {
      // Loại bỏ các từ không phải món ăn
      const cleanDish = dish
        .replace(/^\d+\.\s*/, "") // Bỏ số thứ tự
        .replace(/^[▪︎•\-]+\s*/, "") // Bỏ bullet points
        .trim();

      if (cleanDish.length > 1 && !cleanDish.match(/^[A-Z]\/[A-Z]/)) {
        items.push({
          name: cleanDish,
          category: currentCategory,
        });
      }
    }
  }

  return items;
};