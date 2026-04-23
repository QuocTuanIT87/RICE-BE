// PackagePurchases Controller - Yêu cầu mua gói đặt cơm
import { Request, Response, NextFunction } from "express";
import { PackagePurchaseRequest } from "./packagePurchaseRequest.model";
import { MealPackage } from "../mealPackages/mealPackage.model";
import { UserPackage } from "../userPackages/userPackage.model";
import { User } from "../auth/user.model";
import { Voucher } from "../vouchers/voucher.model";
import { ServiceError } from "../../middlewares";
import { sendPackagePurchaseSuccessEmail, socketService } from "../../services";

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

    // Xử lý Voucher nếu có
    let discountAmount = 0;
    let finalPrice = pkg.price;
    let voucherId = null;

    if (req.body.voucherCode) {
      const voucher = await Voucher.findOne({
        code: req.body.voucherCode.toUpperCase().trim(),
        isActive: true,
      });

      if (!voucher) {
        throw new ServiceError("INVALID_VOUCHER", "Mã giảm giá không hợp lệ", 400);
      }

      const now = new Date();
      if (now < voucher.validFrom || now > voucher.validTo) {
        throw new ServiceError("VOUCHER_EXPIRED", "Mã giảm giá đã hết hạn", 400);
      }

      if (voucher.usedCount >= voucher.usageLimit) {
        throw new ServiceError("VOUCHER_LIMIT_REACHED", "Mã giảm giá đã hết lượt sử dụng", 400);
      }

      // KIỂM TRA USER ĐÃ DÙNG CHƯA
      if (voucher.usedByUsers.some(id => id.toString() === userId)) {
        throw new ServiceError("VOUCHER_ALREADY_USED", "Bạn đã sử dụng mã giảm giá này rồi", 400);
      }

      // KIỂM TRA XEM CÓ YÊU CẦU NÀO ĐANG PENDING DÙNG MÃ NÀY KHÔNG
      const pendingWithVoucher = await PackagePurchaseRequest.findOne({
        userId,
        voucherId: voucher._id,
        status: "pending"
      });

      if (pendingWithVoucher) {
        throw new ServiceError("VOUCHER_PENDING", "Bạn đã có một yêu cầu mua gói đang chờ duyệt sử dụng mã này", 400);
      }

      // KIỂM TRA QUYỀN SỬ DỤNG (NẾU LÀ VOUCHER CHỈ ĐỊNH)
      if (!voucher.isPublic) {
        const isTargeted = voucher.targetUsers?.some(id => id.toString() === userId);
        if (!isTargeted) {
          throw new ServiceError("NOT_TARGETED_USER", "Bạn không thuộc đối tượng được sử dụng mã giảm giá này", 403);
        }
      }

      if (voucher.minPurchase && pkg.price < voucher.minPurchase) {
        throw new ServiceError(
          "MIN_PURCHASE_NOT_MET",
          `Giá trị gói tối thiểu ${voucher.minPurchase.toLocaleString()}đ để dùng mã này`,
          400
        );
      }

      // Tính toán số tiền giảm
      if (voucher.discountType === "fixed") {
        discountAmount = voucher.discountValue;
      } else {
        discountAmount = (pkg.price * voucher.discountValue) / 100;
        if (voucher.maxDiscount && discountAmount > voucher.maxDiscount) {
          discountAmount = voucher.maxDiscount;
        }
      }

      finalPrice = Math.max(0, pkg.price - discountAmount);
      voucherId = voucher._id;
    }

    // Tạo yêu cầu mới
    const request = new PackagePurchaseRequest({
      userId,
      mealPackageId,
      status: "pending",
      requestedAt: new Date(),
      voucherId,
      discountAmount,
      finalPrice,
    });

    await request.save();

    // Thông báo cho Admin có yêu cầu mới
    socketService.emitToAdmin("purchase_request_created", {
      requestId: request._id,
      userId: request.userId,
      mealPackageId: request.mealPackageId,
      status: request.status,
    });

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

    // Nếu có voucher, tăng số lượt đã dùng và thêm user vào danh sách đã dùng
    if (request.voucherId) {
      await Voucher.findByIdAndUpdate(request.voucherId, {
        $inc: { usedCount: 1 },
        $addToSet: { usedByUsers: user._id },
      });
    }

    // Nếu user chưa có activePackage, set package này làm mặc định
    const userDoc = await User.findById(user._id);
    if (userDoc && !userDoc.activePackageId) {
      userDoc.activePackageId = userPackage._id;
      await userDoc.save();
    }

    // Cộng xu bonus cho khách (bonusCoins được cấu hình hoặc mặc định 1000/lượt)
    const bonusCoins = pkg.bonusCoins && pkg.bonusCoins > 0
      ? pkg.bonusCoins
      : pkg.turns * 1000;

    const updatedUser = await User.findByIdAndUpdate(user._id, {
      $inc: { gameCoins: bonusCoins },
    }, { new: true });

    // Gửi email thông báo
    await sendPackagePurchaseSuccessEmail(
      user.email,
      user.name,
      pkg.name,
      pkg.turns,
      pkg.price,
      bonusCoins,
      new Date(),
    );

    // Thông báo cho User biết yêu cầu đã được duyệt
    socketService.emitToUser(user._id.toString(), "purchase_request_approved", {
      requestId: request._id,
      status: "approved",
      bonusCoins: bonusCoins,
      gameCoins: updatedUser?.gameCoins || 0, // Gửi tổng số xu mới
      message: `Gói "${pkg.name}" của bạn đã được kích hoạt! Bạn nhận được +${bonusCoins.toLocaleString()} Xu thưởng.`,
    });

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

    // Thông báo cho User biết yêu cầu bị từ chối
    socketService.emitToUser(request.userId.toString(), "purchase_request_rejected", {
      requestId: request._id,
      status: "rejected",
      message: "Yêu cầu mua gói của bạn đã bị từ chối.",
    });

    res.json({
      success: true,
      message: "Đã từ chối yêu cầu mua gói",
      data: request,
    });
  } catch (error) {
    next(error);
  }
};