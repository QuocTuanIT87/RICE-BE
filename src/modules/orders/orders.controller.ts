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

    // Tính toán menuIndex cho từng order
    const ordersWithIndex = await Promise.all(
      orders.map(async (order) => {
        const orderObj = order.toObject();
        const menuObj = orderObj.dailyMenuId as any;
        if (menuObj && menuObj.menuDate) {
          const start = getStartOfDay(new Date(menuObj.menuDate));
          const end = getEndOfDay(new Date(menuObj.menuDate));
          const menusForDay = await DailyMenu.find({
            menuDate: { $gte: start, $lte: end },
          }).sort({ _id: 1 });
          const index = menusForDay.findIndex(
            (m) => m._id.toString() === menuObj._id.toString(),
          );
          return { ...orderObj, menuIndex: index >= 0 ? index + 1 : 1 };
        }
        return { ...orderObj, menuIndex: 1 };
      }),
    );

    res.json({
      success: true,
      data: ordersWithIndex,
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
    const { menuId } = req.query;

    let menu;
    if (menuId) {
      menu = await DailyMenu.findById(menuId);
    } else {
      // Tìm menu đầu tiên của hôm nay
      menu = await DailyMenu.findOne({
        menuDate: { $gte: startOfDay, $lte: endOfDay },
      });
    }

    if (!menu) {
      res.json({
        success: true,
        data: null,
        message: "Chưa có menu này",
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
    // Nhận mảng items: [{ menuItemId, note, quantity }] và orderType: "normal" | "no-rice"
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

    // Lấy thông tin user để xem gói mặc định (activePackageId)
    const user = await User.findById(userId).select("activePackageId");

    // Tìm TẤT CẢ gói khả dụng (sắp xếp gói mặc định lên đầu, sau đó theo ngày hết hạn)
    const allPackages = await UserPackage.find({
      userId,
      packageType: { $in: [orderType, "coin-exchange"] },
      isActive: true,
      remainingTurns: { $gt: 0 },
      expiresAt: { $gt: new Date() },
    }).sort({ expiresAt: 1 });

    // Đưa gói mặc định lên đầu nếu có
    if (user?.activePackageId) {
      const activeIdx = allPackages.findIndex(
        (p) => p._id.toString() === user.activePackageId!.toString(),
      );
      if (activeIdx > 0) {
        const [activePkg] = allPackages.splice(activeIdx, 1);
        allPackages.unshift(activePkg);
      }
    }

    if (allPackages.length === 0) {
      const packageLabel =
        orderType === "normal" ? "bình thường (có cơm)" : "không cơm";
      throw new ServiceError(
        "NO_MATCHING_PACKAGE",
        `Bạn chưa có gói đặt cơm ${packageLabel} khả dụng. Vui lòng mua gói trước!`,
        400,
      );
    }

    // Tính tổng lượt từ TẤT CẢ gói
    const totalAvailableTurns = allPackages.reduce(
      (sum, pkg) => sum + (pkg.remainingTurns || 0),
      0,
    );

    // Kiểm tra số lượt còn lại có đủ cho tổng số lượng muốn đặt không
    const totalQuantity = (items || []).reduce(
      (sum: number, item: { quantity?: number }) => sum + (item.quantity || 1),
      0,
    );
    if (totalQuantity > totalAvailableTurns) {
      throw new ServiceError(
        "NOT_ENOUGH_TURNS",
        `Bạn chỉ còn ${totalAvailableTurns} lượt, không đủ để đặt ${totalQuantity} phần`,
        400,
      );
    }

    // Dùng gói đầu tiên làm gói chính cho order (ưu tiên gói mặc định)
    const userPackage = allPackages[0];

    // Kiểm tra đã đặt cơm hôm nay chưa
    const existingOrder = await Order.findOne({
      userId,
      dailyMenuId: menu._id,
    });

    if (existingOrder) {
      // KHÔNG cho phép cập nhật nếu đơn hàng đã được admin xác nhận
      if (existingOrder.isConfirmed) {
        throw new ServiceError(
          "ORDER_ALREADY_CONFIRMED",
          "Đơn hàng đã được admin xác nhận, không thể thay đổi nữa",
          400,
        );
      }

      // Cập nhật order hiện có (bao gồm cả orderType nếu thay đổi)
      existingOrder.orderType = orderType as any;
      existingOrder.userPackageId = userPackage._id;
      await existingOrder.save();

      await OrderItem.deleteMany({ orderId: existingOrder._id });

      // Tạo các order items mới với ghi chú và số lượng
      if (items && items.length > 0) {
        await OrderItem.insertMany(
          items.map((item: { menuItemId: string; note?: string; quantity?: number }) => ({
            orderId: existingOrder._id,
            menuItemId: item.menuItemId,
            quantity: item.quantity || 1,
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

    // Tạo các order items với ghi chú và số lượng
    if (items && items.length > 0) {
      await OrderItem.insertMany(
        items.map((item: { menuItemId: string; note?: string; quantity?: number }) => ({
          orderId: order._id,
          menuItemId: item.menuItemId,
          quantity: item.quantity || 1,
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
    const menuIdParam = req.query.menuId as string;
    const date = new Date(dateParam);
    const startOfDay = getStartOfDay(date);
    const endOfDay = getEndOfDay(date);

    // Tìm tất cả menu của ngày này
    const menus = await DailyMenu.find({
      menuDate: { $gte: startOfDay, $lte: endOfDay },
    });

    if (!menus || menus.length === 0) {
      res.json({
        success: true,
        data: {
          menus: [],
          menu: null,
          orders: {
            docs: [],
            total: 0,
            page: 1,
            limit: 4,
            pages: 0,
          },
          summary: [],
        },
      });
      return;
    }

    // Xác định menu sẽ lấy dữ liệu
    let menu = menus[0];
    if (menuIdParam) {
      const foundMenu = menus.find((m) => m._id.toString() === menuIdParam);
      if (foundMenu) menu = foundMenu;
    }

    // Lấy tất cả orders của menu này để tính summary
    const allOrders = await Order.find({ dailyMenuId: menu._id })
      .populate("userId", "name email")
      .populate({
        path: "orderItems",
        populate: { path: "menuItemId" },
      });

    // Tổng hợp số lượng món ăn từ TẤT CẢ orders
    const itemSummary: { [key: string]: { name: string; count: number } } = {};
    for (const order of allOrders) {
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

    // Phân trang danh sách orders để hiển thị
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 4;
    const skip = (page - 1) * limit;

    const [paginatedOrders, total] = await Promise.all([
      Order.find({ dailyMenuId: menu._id })
        .populate("userId", "name email")
        .populate({
          path: "orderItems",
          populate: { path: "menuItemId" },
        })
        .sort({ orderedAt: -1 })
        .skip(skip)
        .limit(limit),
      Order.countDocuments({ dailyMenuId: menu._id }),
    ]);

    res.json({
      success: true,
      data: {
        menus,
        menu,
        orders: {
          docs: paginatedOrders,
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
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
      // Tính tổng số lượng (quantity) trong order
      const orderItems = (order as any).orderItems || [];
      const itemCount = orderItems.reduce(
        (sum: number, item: any) => sum + (item.quantity || 1),
        0,
      );

      if (itemCount > 0) {
        // Tìm TẤT CẢ gói khả dụng của user này (sắp hết hạn trước)
        const userPackages = await UserPackage.find({
          userId: order.userId,
          packageType: { $in: [(order as any).orderType || "normal", "coin-exchange"] },
          isActive: true,
          remainingTurns: { $gt: 0 },
          expiresAt: { $gt: new Date() },
        }).sort({ expiresAt: 1 });

        // Ưu tiên gói được gắn với order lên đầu
        const linkedIdx = userPackages.findIndex(
          (p) => p._id.toString() === order.userPackageId?.toString(),
        );
        if (linkedIdx > 0) {
          const [linkedPkg] = userPackages.splice(linkedIdx, 1);
          userPackages.unshift(linkedPkg);
        }

        // Phân bổ trừ lượt từ gói đầu tiên, tràn sang gói tiếp theo
        let remaining = itemCount;
        for (const pkg of userPackages) {
          if (remaining <= 0) break;

          const deduct = Math.min(remaining, pkg.remainingTurns);
          pkg.remainingTurns -= deduct;
          remaining -= deduct;

          await pkg.save();

          // Deactivate package nếu hết lượt
          if (pkg.remainingTurns <= 0) {
            pkg.isActive = false;
            await pkg.save();

            // Nếu đây là gói mặc định của user, xóa nó đi
            const userWithPkg = await User.findById(order.userId).select("activePackageId");
            if (userWithPkg && userWithPkg.activePackageId?.toString() === pkg._id.toString()) {
              userWithPkg.activePackageId = undefined;
              await userWithPkg.save();
            }
          }
        }

        totalItemsConfirmed += itemCount;
      }

      // Đánh dấu đã confirm
      order.isConfirmed = true;
      await order.save();

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

      // Đếm tổng số lượng
      const orderTotalQty = orderItems.reduce(
        (sum: number, item: any) => sum + (item.quantity || 1),
        0,
      );
      if (isNoRice) {
        totalNoRiceMeals += orderTotalQty;
      } else {
        totalNormalMeals += orderTotalQty;
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

        // Format: Tên món ×SL (ghi chú nếu có)
        let itemText = menuItem.name;
        if (item.quantity && item.quantity > 1) {
          itemText += ` ×${item.quantity}`;
        }
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

/**
 * DELETE /api/orders/:id
 * Hủy đơn hàng (User)
 */
export const deleteOrder = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      throw new ServiceError("ORDER_NOT_FOUND", "Không tìm thấy đơn hàng", 404);
    }

    // Chỉ chủ nhân đơn hàng mới được xóa
    if (order.userId.toString() !== req.user!.userId) {
      throw new ServiceError("FORBIDDEN", "Bạn không có quyền xóa đơn hàng này", 403);
    }

    // Không cho phép xóa nếu đã confirmed
    if (order.isConfirmed) {
      throw new ServiceError(
        "ORDER_ALREADY_CONFIRMED",
        "Đơn hàng đã được xác nhận, không thể hủy",
        400,
      );
    }

    // Xóa order items trước
    await OrderItem.deleteMany({ orderId: order._id });
    
    // Xóa order
    await order.deleteOne();

    // Thông báo cho Admin
    socketService.emitToAdmin("order_deleted", {
      orderId: order._id,
      menuId: order.dailyMenuId,
    });

    res.json({
      success: true,
      message: "Đã hủy đơn đặt cơm thành công!",
    });
  } catch (error) {
    next(error);
  }
};