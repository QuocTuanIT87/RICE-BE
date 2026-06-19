import multer from "multer";
import { ServiceError } from "./errors";

// Cấu hình multer lưu trữ trong bộ nhớ tạm (buffer)
const storage = multer.memoryStorage();

// Hàm kiểm tra định dạng tệp tải lên
const fileFilter = (req: any, file: any, cb: any) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(
      new ServiceError(
        "INVALID_FILE_TYPE",
        "Định dạng tệp không hợp lệ. Chỉ chấp nhận các file hình ảnh (jpeg, png, webp...)",
        400
      ),
      false
    );
  }
};

// Khởi tạo multer với giới hạn 5MB
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});
