import { Request, Response, NextFunction } from "express";
import { DepositRequest } from "./depositRequest.model";
import { User } from "../auth/user.model";
import { Voucher } from "../vouchers/voucher.model";
import { ServiceError } from "../../middlewares";
import { socketService } from "../../services";

/**
 * POST /api/deposit-requests
 * User gửi yêu cầu nạp tiền tự nhập
 */
export const createDepositRequest = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { amount, voucherCode } = req.body;

    if (amount === undefined || typeof amount !== "number" || amount < 1000) {
      throw new ServiceError(
        "INVALID_AMOUNT",
        "Số tiền nạp không hợp lệ. Tối thiểu là 1,000 VND.",
        400,
      );
    }

    let bonusAmount = 0;
    if (voucherCode) {
      const voucher = await Voucher.findOne({
        code: voucherCode.toUpperCase().trim(),
        isActive: true,
      });

      if (!voucher) {
        throw new ServiceError("INVALID_VOUCHER", "Mã voucher không tồn tại hoặc đã hết hiệu lực", 404);
      }

      if (voucher.voucherType !== "deposit") {
        throw new ServiceError("INVALID_VOUCHER_TYPE", "Mã này không phải là voucher nạp tiền", 400);
      }

      const now = new Date();
      if (now < voucher.validFrom || now > voucher.validTo) {
        throw new ServiceError("VOUCHER_EXPIRED", "Mã voucher đã hết hạn sử dụng", 400);
      }

      if (voucher.usedCount >= voucher.usageLimit) {
        throw new ServiceError("VOUCHER_LIMIT_REACHED", "Mã voucher đã hết lượt sử dụng", 400);
      }

      if (voucher.usedByUsers.some(id => id.toString() === req.user!.userId)) {
        throw new ServiceError("VOUCHER_ALREADY_USED", "Bạn đã sử dụng mã giảm giá này rồi", 400);
      }

      // Kiểm tra quyền sử dụng nếu là voucher chỉ định
      if (!voucher.isPublic) {
        const isTargeted = voucher.targetUsers?.some(id => id.toString() === req.user!.userId);
        if (!isTargeted) {
          throw new ServiceError("NOT_TARGETED_USER", "Bạn không thuộc đối tượng được sử dụng mã giảm giá này", 403);
        }
      }

      if (voucher.minPurchase && amount < voucher.minPurchase) {
        throw new ServiceError(
          "MIN_PURCHASE_NOT_MET",
          `Số tiền nạp tối thiểu ${voucher.minPurchase.toLocaleString()}đ để dùng mã này`,
          400
        );
      }

      // Tính toán giá trị thưởng
      if (voucher.discountType === "fixed") {
        bonusAmount = voucher.discountValue;
      } else {
        bonusAmount = (amount * voucher.discountValue) / 100;
        if (voucher.maxDiscount && bonusAmount > voucher.maxDiscount) {
          bonusAmount = voucher.maxDiscount;
        }
      }
    }

    const request = new DepositRequest({
      userId: req.user!.userId,
      amount,
      voucherCode: voucherCode ? voucherCode.toUpperCase().trim() : "",
      bonusAmount,
      status: "pending",
    });

    await request.save();

    // Phát tín hiệu Socket cho admin
    socketService.emitToAdmin("purchase_request_created");

    res.status(201).json({
      success: true,
      message: "Yêu cầu nạp tiền đã được gửi, vui lòng chuyển khoản và đợi duyệt!",
      data: request,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/deposit-requests/my
 * Lấy danh sách yêu cầu nạp của user hiện tại
 */
export const getMyDepositRequests = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const requests = await DepositRequest.find({ userId: req.user!.userId })
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
 * GET /api/deposit-requests
 * Lấy tất cả yêu cầu nạp tiền (Admin)
 */
export const getDepositRequests = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const filter: any = {};
    if (status) filter.status = status;

    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;

    const [docs, total] = await Promise.all([
      DepositRequest.find(filter)
        .populate("userId", "name email phone balance")
        .populate("processedBy", "name email")
        .sort({ requestedAt: -1 })
        .skip(skip)
        .limit(limitNum),
      DepositRequest.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        docs,
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/deposit-requests/:id/approve
 * Admin duyệt yêu cầu nạp tiền và cộng số dư ví
 */
export const approveDepositRequest = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const request = await DepositRequest.findById(req.params.id);

    if (!request) {
      throw new ServiceError(
        "REQUEST_NOT_FOUND",
        "Không tìm thấy yêu cầu nạp tiền này",
        404,
      );
    }

    if (request.status !== "pending") {
      throw new ServiceError(
        "REQUEST_ALREADY_PROCESSED",
        `Yêu cầu này đã được xử lý (Trạng thái: ${request.status})`,
        400,
      );
    }

    // Cập nhật ví tiền của user
    const user = await User.findById(request.userId);
    if (!user) {
      throw new ServiceError("USER_NOT_FOUND", "Không tìm thấy user nạp tiền", 404);
    }

    const bonus = request.bonusAmount || 0;
    user.balance = (user.balance || 0) + request.amount + bonus;
    await user.save();

    // Nếu có voucher, cập nhật trạng thái voucher
    if (request.voucherCode) {
      const voucher = await Voucher.findOne({
        code: request.voucherCode.toUpperCase().trim(),
      });
      if (voucher) {
        voucher.usedCount += 1;
        if (!voucher.usedByUsers.some(id => id.toString() === user._id.toString())) {
          voucher.usedByUsers.push(user._id.toString());
        }
        await voucher.save();
      }
    }

    // Cập nhật trạng thái yêu cầu
    request.status = "approved";
    request.processedAt = new Date();
    request.processedBy = req.user!.userId as any;
    await request.save();

    // Phát tín hiệu cập nhật ví tiền real-time qua Socket
    socketService.emitToUser(user._id.toString(), "coins_updated", {
      balance: user.balance,
      gameCoins: user.gameCoins,
    });
    socketService.emitToUser(user._id.toString(), "purchase_request_approved", {
      balance: user.balance,
      gameCoins: user.gameCoins,
    });

    const bonusText = bonus > 0 ? ` (+${bonus.toLocaleString("vi-VN")} VND khuyến mãi)` : "";
    res.json({
      success: true,
      message: `Đã duyệt thành công! Cộng ${(request.amount + bonus).toLocaleString("vi-VN")} VND${bonusText} vào tài khoản của ${user.name}`,
      data: request,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/deposit-requests/:id/reject
 * Admin từ chối yêu cầu nạp tiền
 */
export const rejectDepositRequest = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const request = await DepositRequest.findById(req.params.id);

    if (!request) {
      throw new ServiceError(
        "REQUEST_NOT_FOUND",
        "Không tìm thấy yêu cầu nạp tiền này",
        404,
      );
    }

    if (request.status !== "pending") {
      throw new ServiceError(
        "REQUEST_ALREADY_PROCESSED",
        `Yêu cầu này đã được xử lý (Trạng thái: ${request.status})`,
        400,
      );
    }

    // Cập nhật trạng thái yêu cầu
    request.status = "rejected";
    request.processedAt = new Date();
    request.processedBy = req.user!.userId as any;
    await request.save();

    // Phát tín hiệu Socket cho user
    socketService.emitToUser(request.userId.toString(), "purchase_request_rejected");

    res.json({
      success: true,
      message: "Đã từ chối yêu cầu nạp tiền!",
      data: request,
    });
  } catch (error) {
    next(error);
  }
};
