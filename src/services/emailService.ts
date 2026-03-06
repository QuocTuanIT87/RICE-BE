// Service gửi email sử dụng Nodemailer
import nodemailer from "nodemailer";
import { env } from "../config";

// Tạo transporter với cấu hình SMTP
const transporter = nodemailer.createTransport({
  host: env.EMAIL_HOST,
  port: env.EMAIL_PORT,
  secure: false, // true cho port 465, false cho các port khác
  auth: {
    user: env.EMAIL_USER,
    pass: env.EMAIL_PASS,
  },
});

/**
 * Gửi email OTP xác thực tài khoản
 */
export const sendOTPEmail = async (
  to: string,
  otp: string,
  name: string,
): Promise<boolean> => {
  try {
    const mailOptions = {
      from: `"Web Đặt Cơm" <${env.EMAIL_USER}>`,
      to,
      subject: "🍚 Mã OTP Xác Thực Tài Khoản - Web Đặt Cơm",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0;">🍚 Web Đặt Cơm</h1>
          </div>
          <div style="padding: 30px; background: #f9f9f9;">
            <h2 style="color: #333;">Xin chào ${name}! 👋</h2>
            <p style="color: #666; font-size: 16px;">
              Cảm ơn bạn đã đăng ký tài khoản tại Web Đặt Cơm.
              Vui lòng sử dụng mã OTP dưới đây để xác thực tài khoản:
            </p>
            <div style="background: #667eea; color: white; font-size: 32px; font-weight: bold; 
                        text-align: center; padding: 20px; border-radius: 10px; letter-spacing: 8px;">
              ${otp}
            </div>
            <p style="color: #999; font-size: 14px; margin-top: 20px;">
              Mã OTP này có hiệu lực trong <strong>10 phút</strong>.<br>
              Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email.
            </p>
          </div>
          <div style="background: #333; color: #999; padding: 20px; text-align: center; font-size: 12px;">
            © 2026 Web Đặt Cơm. All rights reserved.
          </div>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Đã gửi OTP đến ${to}`);
    return true;
  } catch (error) {
    console.error("❌ Lỗi gửi email OTP:", error);
    return false;
  }
};

/**
 * Gửi email thông báo mua gói thành công
 */
export const sendPackagePurchaseSuccessEmail = async (
  to: string,
  name: string,
  packageName: string,
  turns: number,
  price: number,
  bonusCoins: number,
  purchaseTime: Date,
): Promise<boolean> => {
  try {
    const formattedPrice = new Intl.NumberFormat("vi-VN").format(price);
    const formattedTime = new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(purchaseTime);

    const mailOptions = {
      from: `"Web Đặt Cơm" <${env.EMAIL_USER}>`,
      to,
      subject: "🎉 Mua Gói Đặt Cơm Thành Công - Web Đặt Cơm",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0;">🎉 Mua Gói Thành Công!</h1>
          </div>
          <div style="padding: 30px; background: #f9f9f9;">
            <h2 style="color: #333;">Xin chào ${name}! 👋</h2>
            <p style="color: #666; font-size: 16px;">
              Chúc mừng bạn đã mua gói đặt cơm thành công!
            </p>
            <div style="background: white; padding: 20px; border-radius: 10px; border-left: 4px solid #11998e;">
              <p style="margin: 10px 0;"><strong>📦 Tên gói:</strong> ${packageName}</p>
              <p style="margin: 10px 0;"><strong>🎟️ Số lượt:</strong> ${turns} lượt</p>
              <p style="margin: 10px 0;"><strong>💰 Giá:</strong> ${formattedPrice} VND</p>
              <p style="margin: 10px 0;"><strong>🪙 Thưởng:</strong> <span style="color: #f59e0b; font-weight: bold;">+${bonusCoins.toLocaleString()} Xu</span></p>
              <p style="margin: 10px 0;"><strong>🕐 Thời gian:</strong> ${formattedTime}</p>
            </div>
            <p style="color: #666; font-size: 14px; margin-top: 20px;">
              Bạn có thể vào phần <strong>Trang cá nhân</strong> để xem các gói đặt cơm đang khả dụng.
            </p>
          </div>
          <div style="background: #333; color: #999; padding: 20px; text-align: center; font-size: 12px;">
            © 2026 Web Đặt Cơm. All rights reserved.
          </div>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Đã gửi email thông báo mua gói thành công đến ${to}`);
    return true;
  } catch (error) {
    console.error("❌ Lỗi gửi email thông báo:", error);
    return false;
  }
};