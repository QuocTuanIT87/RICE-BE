// DailyMenus Controller - Quản lý menu theo ngày
import { Request, Response, NextFunction } from "express";
import { DailyMenu } from "./dailyMenu.model";
import { MenuItem } from "../menuItems/menuItem.model";
import { ServiceError } from "../../middlewares";
import {
  parseMenuText,
  getStartOfDay,
  getEndOfDay,
  isWithinTimeRange,
} from "../../utils";
import { socketService } from "../../services";

/**
 * GET /api/daily-menus
 * Lấy danh sách menu
 */
export const getDailyMenus = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { limit = 10 } = req.query;

    const menus = await DailyMenu.find()
      .populate("createdBy", "name")
      .sort({ menuDate: -1 })
      .limit(Number(limit));

    res.json({
      success: true,
      data: menus,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/daily-menus/today
 * Lấy tất cả menu hôm nay
 */
export const getTodayMenu = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const startOfDay = getStartOfDay();
    const endOfDay = getEndOfDay();

    const menus = await DailyMenu.find({
      menuDate: { $gte: startOfDay, $lte: endOfDay },
    }).populate("menuItems");

    if (menus.length === 0) {
      res.json({
        success: true,
        data: null,
        message: "Chưa có menu hôm nay",
      });
      return;
    }

    // Trả về tất cả menu với thông tin canOrder
    const menusWithStatus = menus.map((menu) => ({
      ...menu.toObject(),
      canOrder: !menu.isLocked && isWithinTimeRange(menu.beginAt, menu.endAt),
    }));

    res.json({
      success: true,
      data: menusWithStatus,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/daily-menus/:id
 * Lấy chi tiết menu
 */
export const getDailyMenuById = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const menu = await DailyMenu.findById(req.params.id)
      .populate("menuItems")
      .populate("createdBy", "name");

    if (!menu) {
      throw new ServiceError("MENU_NOT_FOUND", "Không tìm thấy menu", 404);
    }

    res.json({
      success: true,
      data: menu,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/daily-menus/preview
 * Preview các món ăn từ text (Admin)
 */
export const previewMenu = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { rawContent } = req.body;

    const items = parseMenuText(rawContent);

    res.json({
      success: true,
      data: items,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/daily-menus
 * Tạo menu mới (Admin)
 */
export const createDailyMenu = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const {
      rawContent,
      menuDate,
      beginAt = "10:00",
      endAt = "10:45",
    } = req.body;

    // Lấy ngày menu (không giới hạn số menu mỗi ngày)
    const date = menuDate ? new Date(menuDate) : new Date();
    const startOfDay = getStartOfDay(date);

    // Tạo menu
    const menu = new DailyMenu({
      menuDate: startOfDay,
      rawContent,
      beginAt,
      endAt,
      createdBy: (req as any).user!.userId,
    });

    await menu.save();

    // Parse và tạo các món ăn
    const items = parseMenuText(rawContent);
    const menuItems = await MenuItem.insertMany(
      items.map((item) => ({
        dailyMenuId: menu._id,
        name: item.name,
        category: item.category,
      })),
    );

    // Thông báo cho mọi người có menu mới
    socketService.emitAll("menu_created", {
      menuId: menu._id,
      menuDate: menu.menuDate,
    });

    res.status(201).json({
      success: true,
      message: "Tạo menu thành công!",
      data: {
        menu,
        menuItems,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/daily-menus/:id
 * Cập nhật menu (Admin)
 */
export const updateDailyMenu = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { rawContent, beginAt, endAt, isLocked } = req.body;

    const menu = await DailyMenu.findById(req.params.id);

    if (!menu) {
      throw new ServiceError("MENU_NOT_FOUND", "Không tìm thấy menu", 404);
    }

    // Cập nhật thông tin cơ bản
    if (beginAt) menu.beginAt = beginAt;
    if (endAt) menu.endAt = endAt;
    if (isLocked !== undefined) menu.isLocked = isLocked;

    // Nếu có rawContent mới, cập nhật danh sách món ăn một cách thông minh
    if (rawContent && rawContent !== menu.rawContent) {
      const oldRawContent = menu.rawContent;
      menu.rawContent = rawContent;

      // Lấy danh sách món cũ hiện có trong DB
      const existingItems = await MenuItem.find({ dailyMenuId: menu._id });

      // Parse nội dung mới
      const newParsedItems = parseMenuText(rawContent);

      // Danh sách ID món ăn mới cho menu
      const newMenuItemIds = [];

      // Xử lý từng món trong nội dung mới
      for (const newItem of newParsedItems) {
        // Tìm xem món này đã có trong DB chưa (dựa vào tên)
        const oldItem = existingItems.find(item => item.name === newItem.name);

        if (oldItem) {
          // Nếu đã có, cập nhật category nếu thay đổi và giữ nguyên ID
          if (oldItem.category !== newItem.category) {
            oldItem.category = newItem.category as any;
            await oldItem.save();
          }
          newMenuItemIds.push(oldItem._id);
        } else {
          // Nếu chưa có, tạo món mới
          const createdItem = await MenuItem.create({
            dailyMenuId: menu._id,
            name: newItem.name,
            category: newItem.category as any
          });
          newMenuItemIds.push(createdItem._id);
        }
      }

      // Cập nhật mảng menuItems trong DailyMenu (chỉ giữ lại những món xuất hiện trong text mới)
      // Lưu ý: Các món cũ không còn trong text mới vẫn tồn tại trong DB để tránh hỏng Order cũ, 
      // nhưng DailyMenu sẽ không trỏ tới chúng nữa.
      (menu as any).menuItems = newMenuItemIds;
    }

    await menu.save();

    const updatedMenu = await DailyMenu.findById(menu._id).populate(
      "menuItems",
    );

    // Thông báo cho mọi người menu đã cập nhật
    socketService.emitAll("menu_updated", {
      menuId: menu._id,
      isLocked: menu.isLocked,
    });

    res.json({
      success: true,
      message: "Cập nhật menu thành công!",
      data: updatedMenu,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/daily-menus/:id/lock
 * Khóa menu (Admin)
 */
export const lockMenu = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const menu = await DailyMenu.findByIdAndUpdate(
      req.params.id,
      { isLocked: true },
      { new: true },
    );

    if (!menu) {
      throw new ServiceError("MENU_NOT_FOUND", "Không tìm thấy menu", 404);
    }

    // Thông báo cho mọi người
    socketService.emitAll("menu_locked", {
      menuId: menu._id,
      message: "Menu đã được khóa.",
    });

    res.json({
      success: true,
      message: "Đã khóa menu!",
      data: menu,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/daily-menus/:id/unlock
 * Mở khóa menu (Admin)
 */
export const unlockMenu = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const menu = await DailyMenu.findByIdAndUpdate(
      req.params.id,
      { isLocked: false },
      { new: true },
    );

    if (!menu) {
      throw new ServiceError("MENU_NOT_FOUND", "Không tìm thấy menu", 404);
    }

    // Thông báo cho mọi người
    socketService.emitAll("menu_unlocked", {
      menuId: menu._id,
      message: "Menu đã được mở khóa!",
    });

    res.json({
      success: true,
      message: "Đã mở khóa menu!",
      data: menu,
    });
  } catch (error) {
    next(error);
  }
};