// Orders Controller - Đặt cơm
import { Request, Response, NextFunction } from "express";
import { Order } from "./order.model";
import { OrderItem } from "./orderItem.model";
import { DailyMenu } from "../dailyMenus/dailyMenu.model";
import { MenuItem } from "../menuItems/menuItem.model";
import { UserPackage } from "../userPackages/userPackage.model";
import { User } from "../auth/user.model";
import { ServiceError } from "../../middlewares";
import { getStartOfDay, getEndOfDay, isWithinTimeRange } from "../../utils";
import { socketService } from "../../services";

/**
 * GET /api/orders/my
 * Lấy danh sách đơn hàng của user
 */
export const getMyOrders = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const orders = await Order.find({ userId: req.user!.userId })
      .populate("dailyMenuId")
      .populate({
        path: "orderItems",
        populate: { path: "menuItemId" },
      })
      .sort({ orderedAt: -1 })
      .limit(20);

    res.json({
      success: true,
      data: orders,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/orders/today
 * Lấy đơn hàng hôm nay của user
 */
export const getMyTodayOrder = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const startOfDay = getStartOfDay();
    const endOfDay = getEndOfDay();

    // Tìm menu hôm nay
    const menu = await DailyMenu.findOne({
      menuDate: { $gte: startOfDay, $lte: endOfDay },
    });

    if (!menu) {
      res.json({
        success: true,
        data: null,
        message: "Chưa có menu hôm nay",
      });
      return;
    }

    // Tìm order của user cho menu này
    const order = await Order.findOne({
      userId: req.user!.userId,
      dailyMenuId: menu._id,
    }).populate({
      path: "orderItems",
      populate: { path: "menuItemId" },
    });

    res.json({
      success: true,
      data: order,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/orders
 * Đặt cơm (User)
 */
export const createOrder = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // Nhận mảng items: [{ menuItemId, note }] và orderType: "normal" | "no-rice"
    const { items, orderType = "normal" } = req.body;
    const userId = req.user!.userId;

    // Validate orderType
    if (orderType !== "normal" && orderType !== "no-rice") {
      throw new ServiceError(
        "INVALID_ORDER_TYPE",
        "Loại đặt cơm không hợp lệ",
        400,
      );
    }

    // Nhận menuId từ frontend - cho phép đặt đúng menu user đã chọn
    const { menuId } = req.body;

    // Nếu có menuId, dùng nó; nếu không thì tìm menu đầu tiên hôm nay (fallback)
    const startOfDay = getStartOfDay();
    const endOfDay = getEndOfDay();

    let menu;
    if (menuId) {
      menu = await DailyMenu.findById(menuId);
      if (!menu) {
        throw new ServiceError("MENU_NOT_FOUND", "Không tìm thấy menu", 404);
      }
    } else {
      // Fallback: tìm menu đầu tiên chưa khóa hôm nay
      menu = await DailyMenu.findOne({
        menuDate: { $gte: startOfDay, $lte: endOfDay },
        isLocked: false,
      });
    }

    if (!menu) {
      throw new ServiceError("MENU_NOT_FOUND", "Chưa có menu hôm nay", 404);
    }

    // Kiểm tra menu đã khóa hoặc ngoài thời gian
    // Tự động coi như khóa nếu ngoài khoảng thời gian beginAt -> endAt
    const isOutsideTimeRange = !isWithinTimeRange(menu.beginAt, menu.endAt);

    if (menu.isLocked || isOutsideTimeRange) {
      const message = menu.isLocked
        ? "Menu đã bị khóa, không thể đặt cơm"
        : `Ngoài thời gian đặt cơm (${menu.beginAt} - ${menu.endAt})`;
      throw new ServiceError("MENU_LOCKED", message, 400);
    }

    // Tìm gói phù hợp với orderType (bình thường hoặc không cơm)
    const userPackage = await UserPackage.findOne({
      userId,
      packageType: orderType,
      isActive: true,
      remainingTurns: { $gt: 0 },
      expiresAt: { $gt: new Date() },
    }).sort({ expiresAt: 1 }); // Ưu tiên gói sắp hết hạn trước

    if (!userPackage) {
      const packageLabel =
        orderType === "normal" ? "bình thường (có cơm)" : "không cơm";
      throw new ServiceError(
        "NO_MATCHING_PACKAGE",
        `Bạn chưa có gói đặt cơm ${packageLabel} khả dụng. Vui lòng mua gói trước!`,
        400,
      );
    }

    // Kiểm tra số lượt còn lại có đủ cho số món muốn đặt không
    const itemsCount = items?.length || 0;
    if (itemsCount > userPackage.remainingTurns) {
      throw new ServiceError(
        "NOT_ENOUGH_TURNS",
        `Bạn chỉ còn ${userPackage.remainingTurns} lượt, không đủ để đặt ${itemsCount} món`,
        400,
      );
    }

    // Kiểm tra đã đặt cơm hôm nay chưa
    const existingOrder = await Order.findOne({
      userId,
      dailyMenuId: menu._id,
    });

    if (existingOrder) {
      // Cập nhật order hiện có (bao gồm cả orderType nếu thay đổi)
      existingOrder.orderType = orderType as any;
      existingOrder.userPackageId = userPackage._id;
      await existingOrder.save();

      await OrderItem.deleteMany({ orderId: existingOrder._id });

      // Tạo các order items mới với ghi chú
      if (items && items.length > 0) {
        await OrderItem.insertMany(
          items.map((item: { menuItemId: string; note?: string }) => ({
            orderId: existingOrder._id,
            menuItemId: item.menuItemId,
            quantity: 1,
            note: item.note || "",
          })),
        );
      }

      const updatedOrder = await Order.findById(existingOrder._id).populate({
        path: "orderItems",
        populate: { path: "menuItemId" },
      });

      res.json({
        success: true,
        message: "Đã cập nhật đơn đặt cơm!",
        data: updatedOrder,
      });

      // Thông báo cho Admin
      socketService.emitToAdmin("order_updated", {
        orderId: existingOrder._id,
        menuId: menu._id,
      });
      return;
    }

    // Tạo đơn hàng mới
    const order = new Order({
      userId,
      dailyMenuId: menu._id,
      userPackageId: userPackage._id,
      orderType: orderType as any,
      isConfirmed: false,
      orderedAt: new Date(),
    });
    await order.save();

    // Tạo các order items với ghi chú
    if (items && items.length > 0) {
      await OrderItem.insertMany(
        items.map((item: { menuItemId: string; note?: string }) => ({
          orderId: order._id,
          menuItemId: item.menuItemId,
          quantity: 1,
          note: item.note || "",
        })),
      );
    }

    const createdOrder = await Order.findById(order._id).populate({
      path: "orderItems",
      populate: { path: "menuItemId" },
    });

    res.status(201).json({
      success: true,
      message: "Đặt cơm thành công!",
      data: createdOrder,
    });

    // Thông báo cho Admin
    socketService.emitToAdmin("order_created", {
      orderId: order._id,
      menuId: menu._id,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/orders/by-date/:date
 * Lấy danh sách đặt cơm theo ngày (Admin)
 */
export const getOrdersByDate = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const dateParam = req.params.date; // Format: YYYY-MM-DD
    const date = new Date(dateParam);
    const startOfDay = getStartOfDay(date);
    const endOfDay = getEndOfDay(date);

    // Tìm menu của ngày này
    const menu = await DailyMenu.findOne({
      menuDate: { $gte: startOfDay, $lte: endOfDay },
    });

    if (!menu) {
      res.json({
        success: true,
        data: {
          menu: null,
          orders: [],
          summary: [],
        },
      });
      return;
    }

    // Lấy tất cả orders của menu này
    const orders = await Order.find({ dailyMenuId: menu._id })
      .populate("userId", "name email")
      .populate({
        path: "orderItems",
        populate: { path: "menuItemId" },
      });

    // Tổng hợp số lượng món ăn
    const itemSummary: { [key: string]: { name: string; count: number } } = {};

    for (const order of orders) {
      const orderItems = (order as any).orderItems || [];
      for (const item of orderItems) {
        const menuItem = item.menuItemId as any;
        if (!menuItem) continue;
        const itemId = menuItem._id.toString();
        if (!itemSummary[itemId]) {
          itemSummary[itemId] = { name: menuItem.name, count: 0 };
        }
        itemSummary[itemId].count += item.quantity;
      }
    }

    const summary = Object.values(itemSummary).sort(
      (a, b) => b.count - a.count,
    );

    res.json({
      success: true,
      data: {
        menu,
        orders,
        summary,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/orders/confirm-all
 * Xác nhận tất cả đơn hàng của ngày (Admin)
 */
export const confirmAllOrders = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { menuId } = req.body;

    const menu = await DailyMenu.findById(menuId);
    if (!menu) {
      throw new ServiceError("MENU_NOT_FOUND", "Không tìm thấy menu", 404);
    }

    // Lấy tất cả orders chưa confirm với order items
    const orders = await Order.find({
      dailyMenuId: menuId,
      isConfirmed: false,
    }).populate("orderItems");

    let totalItemsConfirmed = 0;

    // Xác nhận và trừ lượt cho từng order
    for (const order of orders) {
      // Đếm số món ăn trong order (mỗi món = 1 lượt)
      const orderItems = (order as any).orderItems || [];
      const itemCount = orderItems.length;

      if (itemCount > 0) {
        // Trừ lượt bằng số món ăn
        await UserPackage.findByIdAndUpdate(order.userPackageId, {
          $inc: { remainingTurns: -itemCount },
        });

        totalItemsConfirmed += itemCount;
      }

      // Đánh dấu đã confirm
      order.isConfirmed = true;
      await order.save();

      // Kiểm tra và deactivate package nếu hết lượt
      const userPackage = await UserPackage.findById(order.userPackageId);
      if (userPackage && userPackage.remainingTurns <= 0) {
        userPackage.isActive = false;
        await userPackage.save();
      }

      // Thông báo cho từng user (optional but nice)
      socketService.emitToUser(order.userId.toString(), "order_confirmed", {
        orderId: order._id,
        menuId: menuId,
      });
    }

    // Khóa menu và thông báo cho mọi người
    menu.isLocked = true;
    await menu.save();

    socketService.emitAll("menu_locked", {
      menuId: menuId,
      message: "Menu hôm nay đã chính thức đóng. Chúc các bạn ngon miệng!",
    });

    res.json({
      success: true,
      message: `Đã xác nhận ${orders.length} đơn hàng (${totalItemsConfirmed} món)!`,
      data: {
        confirmedCount: orders.length,
        totalItems: totalItemsConfirmed,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/orders/copy-text/:menuId
 * Lấy text để copy (Admin) - Chi tiết từng đơn với ghi chú
 */
export const getCopyText = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { menuId } = req.params;

    const orders = await Order.find({ dailyMenuId: menuId })
      .populate("userId", "name")
      .populate({
        path: "orderItems",
        populate: { path: "menuItemId" },
      });

    // Tổng hợp số lượng món ăn (để trả về trong response)
    const itemSummary: { [key: string]: { name: string; count: number } } = {};

    // Chi tiết từng đơn hàng - phân theo loại
    const normalOrderDetails: string[] = [];
    const noRiceOrderDetails: string[] = [];
    let totalNormalMeals = 0; // Tổng phần có cơm
    let totalNoRiceMeals = 0; // Tổng phần không cơm

    for (const order of orders) {
      const user = order.userId as any;
      const orderItems = (order as any).orderItems || [];
      const isNoRice = (order as any).orderType === "no-rice";

      if (orderItems.length === 0) continue;

      // Đếm số món
      if (isNoRice) {
        totalNoRiceMeals += orderItems.length;
      } else {
        totalNormalMeals += orderItems.length;
      }

      // Tạo chi tiết đơn hàng của user
      const itemLines: string[] = [];
      for (const item of orderItems) {
        const menuItem = item.menuItemId as any;
        if (!menuItem) continue;

        const itemId = menuItem._id.toString();
        if (!itemSummary[itemId]) {
          itemSummary[itemId] = { name: menuItem.name, count: 0 };
        }
        itemSummary[itemId].count += item.quantity;

        // Format: Tên món (ghi chú nếu có)
        let itemText = menuItem.name;
        if (item.note && item.note.trim()) {
          itemText += ` (${item.note.trim()})`;
        }
        itemLines.push(`  - ${itemText}`);
      }

      const orderText = `📍 ${user?.name || "Khách"}:\n${itemLines.join("\n")}`;

      if (isNoRice) {
        noRiceOrderDetails.push(orderText);
      } else {
        normalOrderDetails.push(orderText);
      }
    }

    // Format text: Tổng số phần + Chi tiết từng đơn
    const totalMeals = totalNormalMeals + totalNoRiceMeals;
    const copyTextParts = [
      `📋 TỔNG HỢP: ${totalMeals} phần (${orders.length} người)`,
      `   🍚 Có cơm: ${totalNormalMeals} phần`,
      `   🥢 Không cơm: ${totalNoRiceMeals} phần`,
      "",
    ];

    if (normalOrderDetails.length > 0) {
      copyTextParts.push("🍚 ĐƠN CÓ CƠM:");
      copyTextParts.push(...normalOrderDetails);
      copyTextParts.push("");
    }

    if (noRiceOrderDetails.length > 0) {
      copyTextParts.push("🥢 ĐƠN KHÔNG CƠM:");
      copyTextParts.push(...noRiceOrderDetails);
    }

    const copyText = copyTextParts.join("\n");

    res.json({
      success: true,
      data: {
        copyText,
        summary: Object.values(itemSummary),
        totalMeals,
        totalNormalMeals,
        totalNoRiceMeals,
        totalOrders: orders.length,
      },
    });
  } catch (error) {
    next(error);
  }
};
