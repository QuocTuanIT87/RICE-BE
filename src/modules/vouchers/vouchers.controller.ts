// Vouchers Controller
import { Request, Response, NextFunction } from "express";
import { Voucher } from "./voucher.model";
import { ServiceError } from "../../middlewares";
import { socketService } from "../../services/socketService";

/**
 * GET /api/vouchers
 * Lấy danh sách voucher (Admin)
 */
export const getVouchers = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 6;
    const skip = (page - 1) * limit;

    const [vouchers, total] = await Promise.all([
      Voucher.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      Voucher.countDocuments(),
    ]);

    res.json({
      success: true,
      data: {
        docs: vouchers,
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
 * POST /api/vouchers
 * Tạo voucher mới (Admin)
 */
export const createVoucher = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const voucher = new Voucher(req.body);
    await voucher.save();
    res.status(201).json({
      success: true,
      data: voucher,
    });

    // Thông báo realtime qua socket
    if (voucher.isPublic) {
      socketService.emitAll("voucher_created", { voucher });
    } else if (voucher.targetUsers && voucher.targetUsers.length > 0) {
      voucher.targetUsers.forEach((userId: any) => {
        socketService.emitToUser(userId.toString(), "voucher_created", { voucher });
      });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/vouchers/:id
 * Cập nhật voucher (Admin)
 */
export const updateVoucher = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const voucher = await Voucher.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!voucher) {
      throw new ServiceError("VOUCHER_NOT_FOUND", "Không tìm thấy voucher", 404);
    }
    res.json({
      success: true,
      data: voucher,
    });

    // Thông báo realtime qua socket
    if (voucher.isPublic) {
      socketService.emitAll("voucher_updated", { voucher });
    } else if (voucher.targetUsers && voucher.targetUsers.length > 0) {
      voucher.targetUsers.forEach((userId: any) => {
        socketService.emitToUser(userId.toString(), "voucher_updated", { voucher });
      });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/vouchers/:id
 * Xóa voucher (Admin)
 */
export const deleteVoucher = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const voucher = await Voucher.findByIdAndDelete(req.params.id);
    if (!voucher) {
      throw new ServiceError("VOUCHER_NOT_FOUND", "Không tìm thấy voucher", 404);
    }
    res.json({
      success: true,
      message: "Đã xóa voucher thành công",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/vouchers/check
 * Kiểm tra mã voucher (User)
 */
export const checkVoucher = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { code, amount } = req.body;

    if (!code) {
      throw new ServiceError("CODE_REQUIRED", "Vui lòng nhập mã voucher", 400);
    }

    const voucher = await Voucher.findOne({
      code: code.toUpperCase().trim(),
      isActive: true,
    });

    if (!voucher) {
      throw new ServiceError("INVALID_VOUCHER", "Mã voucher không tồn tại hoặc đã hết hiệu lực", 404);
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

    if (amount && voucher.minPurchase && amount < voucher.minPurchase) {
      throw new ServiceError(
        "MIN_PURCHASE_NOT_MET",
        `Đơn hàng tối thiểu ${voucher.minPurchase.toLocaleString()}đ để dùng mã này`,
        400
      );
    }

    // Tính toán giá trị giảm
    let discountAmount = 0;
    if (voucher.discountType === "fixed") {
      discountAmount = voucher.discountValue;
    } else {
      discountAmount = (amount * voucher.discountValue) / 100;
      if (voucher.maxDiscount && discountAmount > voucher.maxDiscount) {
        discountAmount = voucher.maxDiscount;
      }
    }

    res.json({
      success: true,
      data: {
        voucherId: voucher._id,
        code: voucher.code,
        discountType: voucher.discountType,
        discountValue: voucher.discountValue,
        discountAmount,
        finalPrice: Math.max(0, (amount || 0) - discountAmount),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/vouchers/my
 * Lấy danh sách voucher mà user hiện tại được hưởng
 */
export const getMyVouchers = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const now = new Date();

    // Tìm các voucher:
    // 1. Đang hoạt động
    // 2. Chưa hết hạn
    // 3. Chưa dùng hết lượt
    // 4. (Là công khai) HOẶC (User có trong targetUsers)
    // 5. User chưa dùng mã này
    const vouchers = await Voucher.find({
      isActive: true,
      validTo: { $gte: now },
      $expr: { $lt: ["$usedCount", "$usageLimit"] },
      usedByUsers: { $ne: userId }, // User chưa dùng
      $or: [
        { isPublic: true },
        { targetUsers: userId }
      ]
    }).sort({ validTo: 1 });

    res.json({
      success: true,
      data: vouchers,
    });
  } catch (error) {
    next(error);
  }
};
