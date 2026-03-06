// Auth Controller - Xử lý đăng ký, đăng nhập, OTP
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { User, IUserDocument } from "./user.model";
import { env } from "../../config";
import { ServiceError, Errors } from "../../middlewares";
import { sendOTPEmail } from "../../services";
import { generateOTP, getOTPExpiry, isOTPValid } from "../../utils";
import { JwtPayload } from "../../types";

/**
 * Tạo JWT token cho user
 */
const createToken = (user: IUserDocument): string => {
  const payload: JwtPayload = {
    userId: user._id!.toString(),
    email: user.email,
    role: user.role,
  };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] });
};

/**
 * Cookie options - Bảo mật và sống 7 ngày
 */
const COOKIE_OPTIONS = {
  httpOnly: true, // Không cho JS truy cập
  secure: env.NODE_ENV === "production", // Chỉ gửi qua HTTPS trong prod
  sameSite: (env.NODE_ENV === "production" ? "none" : "lax") as any, // Cross-site support if needed
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 ngày
};

/**
 * POST /api/auth/register
 * Đăng ký tài khoản mới
 */
export const register = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { name, email, password } = req.body;

    // Kiểm tra email đã tồn tại chưa
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw Errors.EMAIL_EXISTS;
    }

    // Tạo OTP và thời gian hết hạn
    const otpCode = generateOTP();
    const otpExpiry = getOTPExpiry(10); // 10 phút

    // Tạo user mới (chưa verified)
    const user = new User({
      name,
      email,
      password,
      otpCode,
      otpExpiry,
      isVerified: false,
    });

    await user.save();

    // Gửi OTP qua email
    await sendOTPEmail(email, otpCode, name);

    res.status(201).json({
      success: true,
      message: "Đăng ký thành công! Vui lòng kiểm tra email để nhận mã OTP.",
      data: {
        email: user.email,
        requiresOTP: true,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/verify-otp
 * Xác thực OTP
 */
export const verifyOTP = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { email, otp } = req.body;

    // Tìm user với OTP fields
    const user = await User.findOne({ email }).select("+otpCode +otpExpiry");
    if (!user) {
      throw Errors.USER_NOT_FOUND;
    }

    // Kiểm tra OTP
    if (!user.otpCode || user.otpCode !== otp) {
      throw Errors.INVALID_OTP;
    }

    // Kiểm tra hết hạn
    if (!user.otpExpiry || !isOTPValid(user.otpExpiry)) {
      throw Errors.INVALID_OTP;
    }

    // Xác thực thành công
    user.isVerified = true;
    user.otpCode = undefined;
    user.otpExpiry = undefined;
    await user.save();

    // Tạo token
    const token = createToken(user);

    // Set cookie
    res.cookie("token", token, COOKIE_OPTIONS);

    res.json({
      success: true,
      message: "Xác thực tài khoản thành công!",
      data: {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          gameCoins: user.gameCoins,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/resend-otp
 * Gửi lại mã OTP
 */
export const resendOTP = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      throw Errors.USER_NOT_FOUND;
    }

    if (user.isVerified) {
      res.json({
        success: true,
        message: "Tài khoản đã được xác thực trước đó.",
      });
      return;
    }

    // Tạo OTP mới
    const otpCode = generateOTP();
    const otpExpiry = getOTPExpiry(10);

    user.otpCode = otpCode;
    user.otpExpiry = otpExpiry;
    await user.save();

    // Gửi OTP
    await sendOTPEmail(email, otpCode, user.name);

    res.json({
      success: true,
      message: "Đã gửi lại mã OTP. Vui lòng kiểm tra email.",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/login
 * Đăng nhập
 */
export const login = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { email, password } = req.body;

    // Tìm user với password field
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      throw Errors.INVALID_CREDENTIALS;
    }

    // Kiểm tra tài khoản bị khóa
    if (user.isBlocked) {
      throw Errors.USER_BLOCKED;
    }

    // Kiểm tra đã xác thực chưa
    if (!user.isVerified) {
      throw Errors.USER_NOT_VERIFIED;
    }

    // Kiểm tra password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw Errors.INVALID_CREDENTIALS;
    }

    // Tạo token
    const token = createToken(user);

    // Set cookie
    res.cookie("token", token, COOKIE_OPTIONS);

    res.json({
      success: true,
      message: "Đăng nhập thành công! Chào mừng đến với Web Đặt Cơm! 🍚",
      data: {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          gameCoins: user.gameCoins,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/auth/me
 * Lấy thông tin user hiện tại
 */
export const getMe = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const user = await User.findById(userId).populate("activePackageId");
    if (!user) {
      throw Errors.USER_NOT_FOUND;
    }

    res.json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isVerified: user.isVerified,
        gameCoins: user.gameCoins,
        activePackage: user.activePackageId,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/auth/profile
 * Cập nhật thông tin cá nhân
 */
export const updateProfile = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const { name, phone } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      throw Errors.USER_NOT_FOUND;
    }

    if (name) user.name = name;
    if (phone !== undefined) user.phone = phone;

    await user.save();

    res.json({
      success: true,
      message: "Cập nhật thông tin cá nhân thành công!",
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/auth/change-password
 * Đổi mật khẩu
 */
export const changePassword = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const { oldPassword, newPassword } = req.body;

    // Lấy user kèm mật khẩu để so sánh
    const user = await User.findById(userId).select("+password");
    if (!user) {
      throw Errors.USER_NOT_FOUND;
    }

    // Kiểm tra mật khẩu cũ
    const isMatch = await user.comparePassword(oldPassword);
    if (!isMatch) {
      throw Errors.INVALID_PASSWORD;
    }

    // Cập nhật mật khẩu mới (Schema pre-save sẽ tự hash)
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: "Đổi mật khẩu thành công!",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/logout
 * Đăng xuất - Xóa cookie
 */
export const logout = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    res.clearCookie("token", COOKIE_OPTIONS);
    res.json({
      success: true,
      message: "Đăng xuất thành công!",
    });
  } catch (error) {
    next(error);
  }
};