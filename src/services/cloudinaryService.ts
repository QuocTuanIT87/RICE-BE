import { v2 as cloudinary } from "cloudinary";
import { env } from "../config";

// Cấu hình Cloudinary
if (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
  });
}

/**
 * Upload file buffer lên Cloudinary
 * Nếu chưa cấu hình các biến môi trường Cloudinary, sẽ tự động convert ảnh sang dạng Base64 Data URL để lưu trực tiếp vào DB
 * 
 * @param fileBuffer Buffer của hình ảnh
 * @param folder Thư mục lưu trên Cloudinary (mặc định là avatars)
 * @returns Link URL của ảnh hoặc chuỗi Base64 Data URL
 */
export const uploadToCloudinary = (
  fileBuffer: Buffer,
  folder: string = "rice-order/avatar"
): Promise<string> => {
  return new Promise((resolve, reject) => {
    // Kiểm tra xem đã cấu hình đầy đủ API Key chưa
    if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
      console.warn("⚠️ Cloudinary chưa được cấu hình. Sử dụng cơ chế fallback Base64.");
      // Tự động convert thành Base64 Data URL (mặc định dùng định dạng png/jpeg)
      const base64Image = `data:image/jpeg;base64,${fileBuffer.toString("base64")}`;
      return resolve(base64Image);
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
      },
      (error, result) => {
        if (error) {
          console.error("❌ Lỗi upload Cloudinary:", error);
          return reject(error);
        }
        if (!result) {
          return reject(new Error("Lỗi tải ảnh lên Cloudinary: Phản hồi trống"));
        }
        resolve(result.secure_url);
      }
    );

    uploadStream.end(fileBuffer);
  });
};
