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
  const options: jwt.SignOptions = { expiresIn: env.JWT_EXPIRES_IN };
  return jwt.sign(payload, env.JWT_SECRET, options);
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

    // Tạo user mới - AUTO VERIFY vì Render chặn SMTP
    const user = new User({
      name,
      email,
      password,
      otpCode,
      otpExpiry,
      isVerified: true, // Auto verify vì không gửi được email trên Render
    });

    await user.save();

    // Thử gửi OTP qua email (không block nếu fail)
    sendOTPEmail(email, otpCode, name).catch((err) => {
      console.log(
        "⚠️ Không gửi được email OTP (Render chặn SMTP):",
        err.message,
      );
    });

    // Tạo token luôn để user có thể đăng nhập ngay
    const token = createToken(user as IUserDocument);

    res.status(201).json({
      success: true,
      message: "Đăng ký thành công! Bạn có thể đăng nhập ngay.",
      data: {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          isVerified: user.isVerified,
        },
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
        role: user.role,
        isVerified: user.isVerified,
        activePackage: user.activePackageId,
      },
    });
  } catch (error) {
    next(error);
  }
};
