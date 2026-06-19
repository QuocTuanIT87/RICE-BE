import { Request, Response, NextFunction } from "express";
import { DepositRequest } from "./depositRequest.model";
import { User } from "../auth/user.model";
import { Wallet } from "../wallets/wallet.model";
import { Voucher } from "../vouchers/voucher.model";
import { ServiceError } from "../../middlewares";
import { socketService } from "../../services";
import { VipPackage } from "../vipPackages/vipPackage.model";
import { UserMembership } from "../userMemberships/userMembership.model";

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
    const { amount, voucherCode, requestType = "normal", vipPackageId } = req.body;

    let finalAmount = amount;
    let bonusAmount = 0;

    if (requestType === "buy_membership") {
      if (!vipPackageId) {
        throw new ServiceError("MISSING_PACKAGE_ID", "Vui lòng chọn gói VIP cần mua", 400);
      }
      const vipPackage = await VipPackage.findById(vipPackageId);
      if (!vipPackage || !vipPackage.isActive) {
        throw new ServiceError("PACKAGE_NOT_FOUND", "Không tìm thấy gói VIP này hoặc gói đã ẩn", 404);
      }
      finalAmount = vipPackage.price;
    } else {
      if (finalAmount === undefined || typeof finalAmount !== "number" || finalAmount < 10000) {
        throw new ServiceError(
          "INVALID_AMOUNT",
          "Số tiền nạp không hợp lệ. Tối thiểu là 10,000 VND.",
          400,
        );
      }
    }

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
      amount: finalAmount,
      voucherCode: requestType === "buy_membership" ? "" : (voucherCode ? voucherCode.toUpperCase().trim() : ""),
      bonusAmount: requestType === "buy_membership" ? 0 : bonusAmount,
      requestType,
      vipPackageId: requestType === "buy_membership" ? vipPackageId : null,
      status: "pending",
    });

    await request.save();

    // Phát tín hiệu Socket cho admin
    socketService.emitToAdmin("purchase_request_created");

    res.status(201).json({
      success: true,
      message: requestType === "buy_membership"
        ? "Yêu cầu mua gói VIP đã được gửi, vui lòng chuyển khoản đúng số tiền và đợi duyệt!"
        : "Yêu cầu nạp tiền đã được gửi, vui lòng chuyển khoản và đợi duyệt!",
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
      .populate("vipPackageId")
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
    const { status, requestType, page = 1, limit = 10 } = req.query;
    const filter: any = {};
    if (status) filter.status = status;
    if (requestType) filter.requestType = requestType;

    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;

    const [docs, total] = await Promise.all([
      DepositRequest.find(filter)
        .populate("userId", "name email phone")
        .populate("processedBy", "name email")
        .populate("vipPackageId")
        .sort({ requestedAt: -1 })
        .skip(skip)
        .limit(limitNum),
      DepositRequest.countDocuments(filter),
    ]);

    const docsWithBalance = await Promise.all(
      docs.map(async (doc) => {
        const docObj = doc.toObject();
        if (docObj.userId && typeof docObj.userId === "object") {
          const u = docObj.userId as any;
          const w = await Wallet.findOne({ userId: u._id });
          u.balance = w ? w.balance : 0;
        }
        return docObj;
      })
    );

    res.json({
      success: true,
      data: {
        docs: docsWithBalance,
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

    const user = await User.findById(request.userId);
    if (!user) {
      throw new ServiceError("USER_NOT_FOUND", "Không tìm thấy user", 404);
    }

    let wallet = await Wallet.findOne({ userId: user._id });
    if (!wallet) {
      wallet = await Wallet.create({ userId: user._id, balance: 0 });
    }

    let successMsg = "";
    if (request.requestType === "buy_membership") {
      const vipPackage = await VipPackage.findById(request.vipPackageId);
      if (!vipPackage) {
        throw new ServiceError("PACKAGE_NOT_FOUND", "Không tìm thấy gói VIP liên kết với yêu cầu này", 404);
      }

      // Kích hoạt/Gia hạn gói hội viên cho user
      let membership = await UserMembership.findOne({
        userId: user._id,
        isActive: true,
        expiresAt: { $gt: new Date() },
      });

      const now = new Date();
      if (membership) {
        if (membership.vipPackageId.toString() === vipPackage._id.toString()) {
          membership.expiresAt = new Date(membership.expiresAt.getTime() + vipPackage.validDays * 24 * 60 * 60 * 1000);
        } else {
          membership.vipPackageId = vipPackage._id as any;
          membership.activatedAt = now;
          membership.expiresAt = new Date(now.getTime() + vipPackage.validDays * 24 * 60 * 60 * 1000);
        }
      } else {
        membership = new UserMembership({
          userId: user._id,
          vipPackageId: vipPackage._id,
          activatedAt: now,
          expiresAt: new Date(now.getTime() + vipPackage.validDays * 24 * 60 * 60 * 1000),
          isActive: true,
        });
      }
      await membership.save();
      successMsg = `Đã duyệt mua thành công gói VIP ${vipPackage.name} cho ${user.name}!`;
    } else {
      // Nạp tiền thường
      const bonus = request.bonusAmount || 0;
      wallet.balance += request.amount + bonus;
      await wallet.save();

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
      const bonusText = bonus > 0 ? ` (+${bonus.toLocaleString("vi-VN")} VND khuyến mãi)` : "";
      successMsg = `Đã duyệt thành công! Cộng ${(request.amount + bonus).toLocaleString("vi-VN")} VND${bonusText} vào tài khoản của ${user.name}`;
    }

    // Cập nhật trạng thái yêu cầu
    request.status = "approved";
    request.processedAt = new Date();
    request.processedBy = req.user!.userId as any;
    await request.save();

    // Phát tín hiệu cập nhật ví tiền & trạng thái VIP qua Socket
    socketService.emitToUser(user._id.toString(), "coins_updated", {
      balance: wallet.balance,
    });
    socketService.emitToUser(user._id.toString(), "purchase_request_approved", {
      balance: wallet.balance,
    });

    res.json({
      success: true,
      message: successMsg,
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
