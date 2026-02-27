// Users Controller - Quản lý người dùng (Admin)
import { Request, Response, NextFunction } from "express";
import { User } from "../auth/user.model";
import { UserPackage } from "../userPackages/userPackage.model";
import { Order } from "../orders/order.model";
import { ServiceError } from "../../middlewares";

/**
 * GET /api/users
 * Lấy danh sách người dùng (Admin)
 */
export const getUsers = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { role, isBlocked, search } = req.query;

    // Build query filter
    const filter: any = {};

    if (role) filter.role = role;
    if (isBlocked !== undefined) filter.isBlocked = isBlocked === "true";
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const users = await User.find(filter)
      .select("-password")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/users/:id
 * Lấy thông tin chi tiết user (Admin)
 */
export const getUserById = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = await User.findById(req.params.id)
      .select("-password")
      .populate("activePackageId");

    if (!user) {
      throw new ServiceError(
        "USER_NOT_FOUND",
        "Không tìm thấy người dùng",
        404,
      );
    }

    // Lấy danh sách gói đã mua
    const packages = await UserPackage.find({ userId: user._id })
      .populate("mealPackageId")
      .sort({ purchasedAt: -1 });

    // Lấy danh sách đơn hàng đã đặt
    const orders = await Order.find({ userId: user._id })
      .populate("dailyMenuId")
      .populate({
        path: "orderItems",
        populate: { path: "menuItemId" },
      })
      .sort({ orderedAt: -1 })
      .limit(50);

    res.json({
      success: true,
      data: {
        user,
        packages,
        orders,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/users/:id/block
 * Khóa tài khoản user (Admin)
 */
export const blockUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      throw new ServiceError(
        "USER_NOT_FOUND",
        "Không tìm thấy người dùng",
        404,
      );
    }

    // Không cho khóa admin
    if (user.role === "admin") {
      throw new ServiceError(
        "CANNOT_BLOCK_ADMIN",
        "Không thể khóa tài khoản admin",
        400,
      );
    }

    user.isBlocked = true;
    await user.save();

    res.json({
      success: true,
      message: `Đã khóa tài khoản ${user.email}`,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/users/:id/unblock
 * Mở khóa tài khoản user (Admin)
 */
export const unblockUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      throw new ServiceError(
        "USER_NOT_FOUND",
        "Không tìm thấy người dùng",
        404,
      );
    }

    user.isBlocked = false;
    await user.save();

    res.json({
      success: true,
      message: `Đã mở khóa tài khoản ${user.email}`,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/users/:id/reset-password
 * Reset mật khẩu user về 123456 (Admin)
 */
export const resetUserPassword = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = await User.findById(req.params.id).select("+password");

    if (!user) {
      throw new ServiceError(
        "USER_NOT_FOUND",
        "Không tìm thấy người dùng",
        404,
      );
    }

    // Không cho reset admin
    if (user.role === "admin") {
      throw new ServiceError(
        "CANNOT_RESET_ADMIN",
        "Không thể reset mật khẩu tài khoản admin",
        400,
      );
    }

    // Set password về 123456 (pre-save hook sẽ tự hash)
    user.password = "123456";
    await user.save();

    res.json({
      success: true,
      message: `Đã reset mật khẩu của ${user.email} về 123456`,
    });
  } catch (error) {
    next(error);
  }
};
