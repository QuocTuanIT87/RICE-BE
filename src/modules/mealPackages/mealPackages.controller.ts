// MealPackages Controller - Quản lý gói đặt cơm (Admin)
import { Request, Response, NextFunction } from "express";
import { MealPackage } from "./mealPackage.model";
import { ServiceError } from "../../middlewares";

/**
 * GET /api/meal-packages
 * Lấy danh sách gói đặt cơm
 */
export const getMealPackages = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { isActive } = req.query;

    const filter: any = {};
    if (isActive !== undefined) {
      filter.isActive = isActive === "true";
    }

    const packages = await MealPackage.find(filter).sort({ turns: 1 });

    res.json({
      success: true,
      data: packages,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/meal-packages/:id
 * Lấy chi tiết gói đặt cơm
 */
export const getMealPackageById = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const pkg = await MealPackage.findById(req.params.id);

    if (!pkg) {
      throw new ServiceError(
        "PACKAGE_NOT_FOUND",
        "Không tìm thấy gói đặt cơm",
        404,
      );
    }

    res.json({
      success: true,
      data: pkg,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/meal-packages
 * Tạo gói đặt cơm mới (Admin)
 */
export const createMealPackage = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { name, turns, price, validDays, qrCodeImage } = req.body;

    const pkg = new MealPackage({
      name,
      turns,
      price,
      validDays,
      qrCodeImage,
    });

    await pkg.save();

    res.status(201).json({
      success: true,
      message: "Tạo gói đặt cơm thành công!",
      data: pkg,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/meal-packages/:id
 * Cập nhật gói đặt cơm (Admin)
 */
export const updateMealPackage = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { name, turns, price, validDays, qrCodeImage, isActive } = req.body;

    const pkg = await MealPackage.findByIdAndUpdate(
      req.params.id,
      { name, turns, price, validDays, qrCodeImage, isActive },
      { new: true, runValidators: true },
    );

    if (!pkg) {
      throw new ServiceError(
        "PACKAGE_NOT_FOUND",
        "Không tìm thấy gói đặt cơm",
        404,
      );
    }

    res.json({
      success: true,
      message: "Cập nhật gói đặt cơm thành công!",
      data: pkg,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/meal-packages/:id
 * Xóa gói đặt cơm (Admin)
 */
export const deleteMealPackage = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const pkg = await MealPackage.findByIdAndDelete(req.params.id);

    if (!pkg) {
      throw new ServiceError(
        "PACKAGE_NOT_FOUND",
        "Không tìm thấy gói đặt cơm",
        404,
      );
    }

    res.json({
      success: true,
      message: "Xóa gói đặt cơm thành công!",
    });
  } catch (error) {
    next(error);
  }
};
