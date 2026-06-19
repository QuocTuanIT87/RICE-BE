import { Request, Response, NextFunction } from "express";
import { VipLevel } from "./vipLevel.model";
import { ServiceError } from "../../middlewares";
import { recalculateAllUsersVipLevels } from "../../utils/vip";

/**
 * GET /api/vip-levels
 * Lấy tất cả cấp độ VIP (Public)
 */
export const getVipLevels = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const levels = await VipLevel.find().sort({ threshold: 1 });
    res.json({
      success: true,
      data: levels,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/vip-levels
 * Tạo cấp độ VIP mới (Admin)
 */
export const createVipLevel = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { levelCode, name, threshold, discountRate } = req.body;

    if (!levelCode || !name || threshold === undefined || discountRate === undefined) {
      throw new ServiceError("BAD_REQUEST", "Vui lòng nhập đầy đủ thông tin", 400);
    }

    // Check levelCode trùng
    const existingLevel = await VipLevel.findOne({ levelCode: levelCode.toLowerCase().trim() });
    if (existingLevel) {
      throw new ServiceError("LEVEL_EXISTS", "Mã cấp VIP này đã tồn tại", 400);
    }

    const newLevel = new VipLevel({
      levelCode: levelCode.toLowerCase().trim(),
      name: name.trim(),
      threshold,
      discountRate,
    });

    await newLevel.save();
    await recalculateAllUsersVipLevels();

    res.status(201).json({
      success: true,
      message: `Đã tạo thành công cấp VIP: ${name}`,
      data: newLevel,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/vip-levels/:id
 * Cập nhật thông tin cấp VIP (Admin)
 */
export const updateVipLevel = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { name, threshold, discountRate } = req.body;
    const level = await VipLevel.findById(req.params.id);

    if (!level) {
      throw new ServiceError("NOT_FOUND", "Không tìm thấy cấp VIP này", 404);
    }

    // Không cho phép đổi threshold của normal thành khác 0
    if (level.levelCode === "normal" && threshold !== undefined && threshold !== 0) {
      throw new ServiceError("BAD_REQUEST", "Không thể thay đổi ngưỡng chi tiêu của cấp mặc định (Normal)", 400);
    }

    if (name) level.name = name.trim();
    if (threshold !== undefined) level.threshold = threshold;
    if (discountRate !== undefined) level.discountRate = discountRate;

    await level.save();
    await recalculateAllUsersVipLevels();

    res.json({
      success: true,
      message: `Đã cập nhật cấp VIP: ${level.name}`,
      data: level,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/vip-levels/:id
 * Xóa cấp VIP (Admin)
 */
export const deleteVipLevel = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const level = await VipLevel.findById(req.params.id);

    if (!level) {
      throw new ServiceError("NOT_FOUND", "Không tìm thấy cấp VIP này", 404);
    }

    if (level.levelCode === "normal") {
      throw new ServiceError("BAD_REQUEST", "Không thể xóa cấp VIP mặc định (Normal)", 400);
    }

    await level.deleteOne();
    await recalculateAllUsersVipLevels();

    res.json({
      success: true,
      message: `Đã xóa thành công cấp VIP: ${level.name}`,
    });
  } catch (error) {
    next(error);
  }
};
