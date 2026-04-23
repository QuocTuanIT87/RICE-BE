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

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find(filter)
        .select("-password")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        docs: users,
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
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

/**
 * GET /api/users/leaderboard
 * Lấy bảng xếp hạng Top Đại Gia (Public)
 */
export const getLeaderboard = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const topUsers = await UserPackage.aggregate([
      // Lọc các gói đang active và chưa hết hạn
      {
        $match: {
          isActive: true,
          expiresAt: { $gt: new Date() },
          remainingTurns: { $gt: 0 },
        },
      },
      // Group theo userId và tính tổng lượt
      {
        $group: {
          _id: "$userId",
          totalTurns: { $sum: "$remainingTurns" },
          packageCount: { $sum: 1 },
        },
      },
      // Sắp xếp giảm dần theo tổng lượt
      {
        $sort: { totalTurns: -1 },
      },
      // Giới hạn top 10
      {
        $limit: 10,
      },
      // Join với collection users để lấy thông tin
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "userInfo",
        },
      },
      // Unwind userInfo array
      {
        $unwind: "$userInfo",
      },
      // Project ra các trường cần thiết
      {
        $project: {
          _id: 1,
          totalTurns: 1,
          packageCount: 1,
          name: "$userInfo.name",
          gameCoins: "$userInfo.gameCoins",
          // Mặc định avatar nếu có
          avatar: "$userInfo.avatar",
        },
      },
    ]);

    res.json({
      success: true,
      data: topUsers,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/users/leaderboard/coins
 * Lấy bảng xếp hạng Top Tỷ Phú Xu (Public)
 */
export const getTopCoins = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const topUsers = await User.find({ role: { $ne: "admin" } })
      .select("name avatar gameCoins")
      .sort({ gameCoins: -1 })
      .limit(10);

    res.json({
      success: true,
      data: topUsers,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/users/leaderboard/orders
 * Lấy bảng xếp hạng Top Siêu Ăn Uống (Public)
 */
export const getTopOrders = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const topUsers = await Order.aggregate([
      // Chỉ tính các đơn đã xác nhận (tùy nhu cầu, ở đây tính hết cũng được)
      // { $match: { isConfirmed: true } },
      {
        $group: {
          _id: "$userId",
          orderCount: { $sum: 1 },
        },
      },
      {
        $sort: { orderCount: -1 },
      },
      {
        $limit: 10,
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "userInfo",
        },
      },
      {
        $unwind: "$userInfo",
      },
      {
        $project: {
          _id: 1,
          orderCount: 1,
          name: "$userInfo.name",
          gameCoins: "$userInfo.gameCoins",
          avatar: "$userInfo.avatar",
        },
      },
    ]);

    res.json({
      success: true,
      data: topUsers,
    });
  } catch (error) {
    next(error);
  }
};