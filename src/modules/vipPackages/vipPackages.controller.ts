import { Request, Response, NextFunction } from "express";
import { VipPackage } from "./vipPackage.model";
import { ServiceError } from "../../middlewares";

/**
 * GET /api/vip-packages
 * Lấy danh sách các gói VIP đang hoạt động (User)
 */
export const getActiveVipPackages = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const packages = await VipPackage.find({ isActive: true }).sort({ price: 1 });
    res.json({
      success: true,
      data: packages,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/vip-packages/admin
 * Lấy toàn bộ danh sách gói VIP bao gồm cả gói ẩn (Admin)
 */
export const getAdminVipPackages = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const packages = await VipPackage.find().sort({ price: 1 });
    res.json({
      success: true,
      data: packages,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/vip-packages
 * Tạo mới gói VIP (Admin)
 */
export const createVipPackage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { name, price, discountAmount, validDays, isActive, features } = req.body;

    if (!name || price === undefined || discountAmount === undefined || !validDays) {
      throw new ServiceError("MISSING_FIELDS", "Vui lòng nhập đầy đủ thông tin bắt buộc", 400);
    }

    const newPackage = new VipPackage({
      name,
      price,
      discountAmount,
      validDays,
      isActive: isActive !== undefined ? isActive : true,
      features: features || [],
    });

    await newPackage.save();

    res.status(201).json({
      success: true,
      message: "Tạo gói Hội Viên VIP thành công!",
      data: newPackage,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/vip-packages/:id
 * Cập nhật gói VIP (Admin)
 */
export const updateVipPackage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { name, price, discountAmount, validDays, isActive, features } = req.body;
    const pkg = await VipPackage.findById(req.params.id);

    if (!pkg) {
      throw new ServiceError("PACKAGE_NOT_FOUND", "Không tìm thấy gói VIP này", 404);
    }

    if (name) pkg.name = name;
    if (price !== undefined) pkg.price = price;
    if (discountAmount !== undefined) pkg.discountAmount = discountAmount;
    if (validDays !== undefined) pkg.validDays = validDays;
    if (isActive !== undefined) pkg.isActive = isActive;
    if (features) pkg.features = features;

    await pkg.save();

    res.json({
      success: true,
      message: "Cập nhật gói Hội Viên VIP thành công!",
      data: pkg,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/vip-packages/:id
 * Xóa gói VIP (Admin)
 */
export const deleteVipPackage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const pkg = await VipPackage.findById(req.params.id);
    if (!pkg) {
      throw new ServiceError("PACKAGE_NOT_FOUND", "Không tìm thấy gói VIP này", 404);
    }

    await pkg.deleteOne();

    res.json({
      success: true,
      message: "Đã xóa gói VIP thành công!",
    });
  } catch (error) {
    next(error);
  }
};
