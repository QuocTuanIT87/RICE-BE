// Orders Controller - Đặt cơm
import { Request, Response, NextFunction } from "express";
import { Order } from "./order.model";
import { OrderItem } from "./orderItem.model";
import { DailyMenu } from "../dailyMenus/dailyMenu.model";
import { MenuItem } from "../menuItems/menuItem.model";
import { User } from "../auth/user.model";
import { Voucher } from "../vouchers/voucher.model";
import SystemConfig from "../../models/SystemConfig";
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
    // Nhận mảng items: [{ menuItemId, note, quantity }], orderType, menuId và voucherCode
    const { items, orderType = "normal", menuId, voucherCode } = req.body;
    const userId = req.user!.userId;

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

    // Validate orderType
    if (orderType !== "normal" && orderType !== "no-rice") {
      throw new ServiceError(
        "INVALID_ORDER_TYPE",
        "Loại đặt cơm không hợp lệ",
        400,
      );
    }

    // Lấy cấu hình giá từ SystemConfig
    const config = await SystemConfig.findOne();
    const priceNormal = config?.priceNormal || 30000;
    const priceNoRice = config?.priceNoRice || 20000;

    // Tính tổng số lượng phần đặt
    const totalQuantity = (items || []).reduce(
      (sum: number, item: { quantity?: number }) => sum + (item.quantity || 1),
      0,
    );

    const subtotal = totalQuantity * (orderType === "no-rice" ? priceNoRice : priceNormal);

    // Xử lý áp dụng voucher giảm giá
    let discountAmount = 0;
    if (voucherCode) {
      const voucher = await Voucher.findOne({
        code: voucherCode.toUpperCase().trim(),
        isActive: true,
      });

      if (!voucher) {
        throw new ServiceError("INVALID_VOUCHER", "Mã voucher không tồn tại hoặc đã hết hiệu lực", 404);
      }

      if (voucher.voucherType !== "order") {
        throw new ServiceError("INVALID_VOUCHER_TYPE", "Mã này không phải là voucher đặt cơm", 400);
      }

      const now = new Date();
      if (now < voucher.validFrom || now > voucher.validTo) {
        throw new ServiceError("VOUCHER_EXPIRED", "Mã voucher đã hết hạn sử dụng", 400);
      }

      if (voucher.usedCount >= voucher.usageLimit) {
        throw new ServiceError("VOUCHER_LIMIT_REACHED", "Mã voucher đã hết lượt sử dụng", 400);
      }

      if (voucher.usedByUsers.some(id => id.toString() === userId)) {
        throw new ServiceError("VOUCHER_ALREADY_USED", "Bạn đã sử dụng mã giảm giá này rồi", 400);
      }

      // Kiểm tra quyền sử dụng nếu là voucher chỉ định
      if (!voucher.isPublic) {
        const isTargeted = voucher.targetUsers?.some(id => id.toString() === userId);
        if (!isTargeted) {
          throw new ServiceError("NOT_TARGETED_USER", "Bạn không thuộc đối tượng được sử dụng mã giảm giá này", 403);
        }
      }

      if (voucher.minPurchase && subtotal < voucher.minPurchase) {
        throw new ServiceError(
          "MIN_PURCHASE_NOT_MET",
          `Đơn cơm tối thiểu ${voucher.minPurchase.toLocaleString()}đ để dùng mã này`,
          400
        );
      }

      // Tính toán giá trị giảm
      if (voucher.discountType === "fixed") {
        discountAmount = voucher.discountValue;
      } else {
        discountAmount = (subtotal * voucher.discountValue) / 100;
        if (voucher.maxDiscount && discountAmount > voucher.maxDiscount) {
          discountAmount = voucher.maxDiscount;
        }
      }
    }

    const totalPrice = Math.max(0, subtotal - discountAmount);

    // Lấy thông tin user để xem số dư ví tiền
    const userDoc = await User.findById(userId).select("balance");
    if (!userDoc) {
      throw new ServiceError("USER_NOT_FOUND", "Không tìm thấy user", 404);
    }

    if (userDoc.balance < totalPrice) {
      throw new ServiceError(
        "INSUFFICIENT_BALANCE",
        `Số dư ví không đủ. Cần ${totalPrice.toLocaleString("vi-VN")} VND, bạn hiện có ${userDoc.balance.toLocaleString("vi-VN")} VND. Vui lòng nạp thêm tiền!`,
        400,
      );
    }

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
      existingOrder.totalPrice = totalPrice;
      existingOrder.voucherCode = voucherCode ? voucherCode.toUpperCase().trim() : "";
      existingOrder.discountAmount = discountAmount;
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
      orderType: orderType as any,
      totalPrice,
      voucherCode: voucherCode ? voucherCode.toUpperCase().trim() : "",
      discountAmount,
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

    // Lấy cấu hình giá từ SystemConfig để dự phòng
    const config = await SystemConfig.findOne();
    const priceNormal = config?.priceNormal || 30000;
    const priceNoRice = config?.priceNoRice || 20000;

    // Xác nhận và trừ tiền cho từng order
    for (const order of orders) {
      // Tính tổng số lượng (quantity) trong order
      const orderItems = (order as any).orderItems || [];
      const itemCount = orderItems.reduce(
        (sum: number, item: any) => sum + (item.quantity || 1),
        0,
      );

      if (itemCount > 0) {
        // Lấy giá trị đơn đặt cơm (từ thuộc tính totalPrice, hoặc tính toán nếu chưa có)
        const cost = (order as any).totalPrice || (itemCount * (order.orderType === "no-rice" ? priceNoRice : priceNormal));
        
        // Trừ tiền trực tiếp vào ví của người dùng
        await User.findByIdAndUpdate(order.userId, {
          $inc: { balance: -cost }
        });

        // Nếu đơn hàng có sử dụng voucher, cập nhật trạng thái voucher
        if (order.voucherCode) {
          const voucher = await Voucher.findOne({
            code: order.voucherCode.toUpperCase().trim(),
          });
          if (voucher) {
            voucher.usedCount += 1;
            if (!voucher.usedByUsers.some(id => id.toString() === order.userId.toString())) {
              voucher.usedByUsers.push(order.userId.toString());
            }
            await voucher.save();
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