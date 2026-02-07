// UserPackages Controller - Gói đặt cơm của user
import { Request, Response, NextFunction } from "express";
import { UserPackage } from "./userPackage.model";
import { User } from "../auth/user.model";
import { ServiceError } from "../../middlewares";

/**
 * GET /api/user-packages/my
 * Lấy danh sách gói đã mua của user hiện tại
 */
export const getMyPackages = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const packages = await UserPackage.find({ userId: req.user!.userId })
      .populate("mealPackageId")
      .sort({ purchasedAt: -1 });

    res.json({
      success: true,
      data: packages,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/user-packages/my/active
 * Lấy các gói còn khả dụng của user
 */
export const getMyActivePackages = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const now = new Date();

    const packages = await UserPackage.find({
      userId: req.user!.userId,
      isActive: true,
      remainingTurns: { $gt: 0 },
      expiresAt: { $gt: now },
    })
      .populate("mealPackageId")
      .sort({ purchasedAt: -1 });

    res.json({
      success: true,
      data: packages,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/user-packages/:id/set-active
 * Đặt gói làm mặc định để đặt cơm
 */
export const setActivePackage = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userPackage = await UserPackage.findOne({
      _id: req.params.id,
      userId: req.user!.userId,
    });

    if (!userPackage) {
      throw new ServiceError(
        "PACKAGE_NOT_FOUND",
        "Không tìm thấy gói đặt cơm",
        404,
      );
    }

    // Kiểm tra gói còn khả dụng không
    const now = new Date();
    if (
      !userPackage.isActive ||
      userPackage.remainingTurns <= 0 ||
      userPackage.expiresAt < now
    ) {
      throw new ServiceError(
        "PACKAGE_UNAVAILABLE",
        "Gói đặt cơm không còn khả dụng",
        400,
      );
    }

    // Cập nhật activePackageId cho user
    await User.findByIdAndUpdate(req.user!.userId, {
      activePackageId: userPackage._id,
    });

    res.json({
      success: true,
      message: "Đã đặt gói làm mặc định!",
      data: userPackage,
    });
  } catch (error) {
    next(error);
  }
};
