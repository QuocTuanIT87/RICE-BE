// PackagePurchases Controller - Yêu cầu mua gói đặt cơm
import { Request, Response, NextFunction } from "express";
import { PackagePurchaseRequest } from "./packagePurchaseRequest.model";
import { MealPackage } from "../mealPackages/mealPackage.model";
import { UserPackage } from "../userPackages/userPackage.model";
import { User } from "../auth/user.model";
import { ServiceError } from "../../middlewares";
import { sendPackagePurchaseSuccessEmail } from "../../services";

/**
 * GET /api/package-purchases
 * Lấy danh sách yêu cầu mua gói (Admin)
 */
export const getPurchaseRequests = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { status } = req.query;

    const filter: any = {};
    if (status) filter.status = status;

    const requests = await PackagePurchaseRequest.find(filter)
      .populate("userId", "name email")
      .populate("mealPackageId")
      .sort({ requestedAt: -1 });

    res.json({
      success: true,
      data: requests,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/package-purchases/my
 * Lấy danh sách yêu cầu mua gói của user hiện tại
 */
export const getMyPurchaseRequests = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const requests = await PackagePurchaseRequest.find({
      userId: req.user!.userId,
    })
      .populate("mealPackageId")
      .sort({ requestedAt: -1 });

    res.json({
      success: true,
      data: requests,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/package-purchases
 * Tạo yêu cầu mua gói (User)
 */
export const createPurchaseRequest = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { mealPackageId } = req.body;
    const userId = req.user!.userId;

    // Kiểm tra gói có tồn tại không
    const pkg = await MealPackage.findById(mealPackageId);
    if (!pkg || !pkg.isActive) {
      throw new ServiceError(
        "PACKAGE_NOT_FOUND",
        "Gói đặt cơm không tồn tại hoặc không khả dụng",
        404,
      );
    }

    // Kiểm tra có yêu cầu pending nào không
    const existingRequest = await PackagePurchaseRequest.findOne({
      userId,
      mealPackageId,
      status: "pending",
    });

    if (existingRequest) {
      throw new ServiceError(
        "REQUEST_ALREADY_EXISTS",
        "Bạn đã có yêu cầu mua gói này đang chờ xử lý",
        400,
      );
    }

    // Tạo yêu cầu mới
    const request = new PackagePurchaseRequest({
      userId,
      mealPackageId,
      status: "pending",
      requestedAt: new Date(),
    });

    await request.save();

    res.status(201).json({
      success: true,
      message:
        "Đã gửi yêu cầu mua gói! Vui lòng chờ admin xác nhận thanh toán.",
      data: request,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/package-purchases/:id/approve
 * Duyệt yêu cầu mua gói (Admin)
 */
export const approvePurchaseRequest = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const request = await PackagePurchaseRequest.findById(req.params.id)
      .populate("userId")
      .populate("mealPackageId");

    if (!request) {
      throw new ServiceError(
        "REQUEST_NOT_FOUND",
        "Không tìm thấy yêu cầu",
        404,
      );
    }

    if (request.status !== "pending") {
      throw new ServiceError(
        "REQUEST_ALREADY_PROCESSED",
        "Yêu cầu đã được xử lý",
        400,
      );
    }

    const user = request.userId as any;
    const pkg = request.mealPackageId as any;

    // Tính ngày hết hạn
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + pkg.validDays);

    // Tạo UserPackage mới
    const userPackage = new UserPackage({
      userId: user._id,
      mealPackageId: pkg._id,
      packageType: pkg.packageType || "normal", // Lưu loại gói
      remainingTurns: pkg.turns,
      purchasedAt: new Date(),
      expiresAt,
      isActive: true,
    });

    await userPackage.save();

    // Cập nhật trạng thái yêu cầu
    request.status = "approved";
    request.processedAt = new Date();
    request.processedBy = req.user!.userId as any;
    await request.save();

    // Nếu user chưa có activePackage, set package này làm mặc định
    const userDoc = await User.findById(user._id);
    if (userDoc && !userDoc.activePackageId) {
      userDoc.activePackageId = userPackage._id;
      await userDoc.save();
    }

    // Gửi email thông báo
    await sendPackagePurchaseSuccessEmail(
      user.email,
      user.name,
      pkg.name,
      pkg.turns,
      pkg.price,
      new Date(),
    );

    res.json({
      success: true,
      message: `Đã xác nhận mua gói "${pkg.name}" cho ${user.name}`,
      data: { request, userPackage },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/package-purchases/:id/reject
 * Từ chối yêu cầu mua gói (Admin)
 */
export const rejectPurchaseRequest = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const request = await PackagePurchaseRequest.findById(req.params.id);

    if (!request) {
      throw new ServiceError(
        "REQUEST_NOT_FOUND",
        "Không tìm thấy yêu cầu",
        404,
      );
    }

    if (request.status !== "pending") {
      throw new ServiceError(
        "REQUEST_ALREADY_PROCESSED",
        "Yêu cầu đã được xử lý",
        400,
      );
    }

    request.status = "rejected";
    request.processedAt = new Date();
    request.processedBy = req.user!.userId as any;
    await request.save();

    res.json({
      success: true,
      message: "Đã từ chối yêu cầu mua gói",
      data: request,
    });
  } catch (error) {
    next(error);
  }
};
