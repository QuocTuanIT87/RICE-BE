// Users Controller - Quản lý người dùng (Admin)
import { Request, Response, NextFunction } from "express";
import { User } from "../auth/user.model";
import { Order } from "../orders/order.model";
import { DepositRequest } from "../depositRequests/depositRequest.model";
import { ServiceError } from "../../middlewares";
import { socketService } from "../../services";

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
      .select("-password");

    if (!user) {
      throw new ServiceError(
        "USER_NOT_FOUND",
        "Không tìm thấy người dùng",
        404,
      );
    }

    // Lấy lịch sử yêu cầu nạp tiền
    const packages = await DepositRequest.find({ userId: user._id })
      .sort({ requestedAt: -1 });

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
    const topUsers = await User.find({ role: { $ne: "admin" } })
      .select("name avatar balance gameCoins")
      .sort({ balance: -1 })
      .limit(10);

    // Format matching the expected properties in frontend
    const formattedUsers = topUsers.map(u => ({
      _id: u._id,
      name: u.name,
      avatar: (u as any).avatar,
      gameCoins: u.gameCoins,
      totalTurns: u.balance, // reuse totalTurns property as balance to avoid breaking frontend leaderboard
    }));

    res.json({
      success: true,
      data: formattedUsers,
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

/**
 * PUT /api/users/:id/balance
 * Điều chỉnh số dư của user (Admin)
 */
export const updateUserBalance = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { balance } = req.body;
    if (balance === undefined || typeof balance !== "number" || balance < 0) {
      throw new ServiceError("INVALID_BALANCE", "Số dư không hợp lệ", 400);
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      throw new ServiceError("USER_NOT_FOUND", "Không tìm thấy người dùng", 404);
    }

    user.balance = balance;
    await user.save();

    // Phát tín hiệu cập nhật ví tiền real-time
    socketService.emitToUser(user._id.toString(), "coins_updated", {
      balance: user.balance,
    });

    res.json({
      success: true,
      message: `Đã cập nhật số dư ví của ${user.name} thành ${balance.toLocaleString("vi-VN")} VND`,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};