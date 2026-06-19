// Orders Controller - Đặt cơm
import { Request, Response, NextFunction } from "express";
import { Order } from "./order.model";
import { OrderItem } from "./orderItem.model";
import { DailyMenu } from "../dailyMenus/dailyMenu.model";
import { MenuItem } from "../menuItems/menuItem.model";
import { User } from "../auth/user.model";
import { Wallet } from "../wallets/wallet.model";
import { UserMembership } from "../userMemberships/userMembership.model";
import { Voucher } from "../vouchers/voucher.model";
import SystemConfig from "../system/systemConfig.model";
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
    // Tìm kiếm đơn đặt cơm hiện có của người dùng cho ngày hôm nay để tính toán
    const existingOrder = await Order.findOne({
      userId,
      dailyMenuId: menu._id,
    });

    // Tìm gói hội viên đang hiệu lực của user
    const membership = await UserMembership.findOne({
      userId,
      isActive: true,
      expiresAt: { $gt: new Date() },
    }).populate("vipPackageId");

    const vipPackage = membership?.vipPackageId as any;
    const vipDiscountAmount = vipPackage ? (totalQuantity * (vipPackage.discountAmount || 0)) : 0;

    // Xử lý áp dụng voucher giảm giá
    let discountAmount = 0;
    let appliedVoucherDoc = null;
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

      const isSameVoucherOnExistingOrder = existingOrder && existingOrder.voucherCode?.toUpperCase().trim() === voucher.code.toUpperCase().trim();

      if (!isSameVoucherOnExistingOrder && voucher.usedCount >= voucher.usageLimit) {
        throw new ServiceError("VOUCHER_LIMIT_REACHED", "Mã voucher đã hết lượt sử dụng", 400);
      }

      if (!isSameVoucherOnExistingOrder && voucher.usedByUsers.some(id => id.toString() === userId)) {
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
      appliedVoucherDoc = voucher;
    }

    const totalPrice = Math.max(0, subtotal - vipDiscountAmount - discountAmount);

    // Lấy thông tin đơn hàng cũ để tính độ lệch giá trị
    const oldPrice = existingOrder ? (existingOrder.totalPrice ?? 0) : 0;
    const diffPrice = totalPrice - oldPrice;

    // Lấy thông tin ví của user
    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      wallet = await Wallet.create({ userId, balance: 0 });
    }

    // Nếu phải đóng thêm tiền chênh lệch, kiểm tra số dư ví
    if (diffPrice > 0 && wallet.balance < diffPrice) {
      throw new ServiceError(
        "INSUFFICIENT_BALANCE",
        `Số dư ví không đủ. Cần thêm ${diffPrice.toLocaleString("vi-VN")} VND để nâng cấp đơn cơm. Bạn hiện có ${wallet.balance.toLocaleString("vi-VN")} VND. Vui lòng nạp thêm tiền!`,
        400,
      );
    }

    // Thực hiện trừ/hoàn tiền trực tiếp vào ví
    if (diffPrice !== 0) {
      wallet.balance -= diffPrice;
      await wallet.save();
    }

    // Xử lý thu hồi voucher cũ nếu người dùng đổi voucher hoặc xóa voucher
    if (existingOrder && existingOrder.voucherCode && existingOrder.voucherCode.toUpperCase().trim() !== (voucherCode ? voucherCode.toUpperCase().trim() : "")) {
      const oldVoucher = await Voucher.findOne({
        code: existingOrder.voucherCode.toUpperCase().trim(),
      });
      if (oldVoucher) {
        oldVoucher.usedCount = Math.max(0, oldVoucher.usedCount - 1);
        oldVoucher.usedByUsers = oldVoucher.usedByUsers.filter(id => id.toString() !== userId);
        await oldVoucher.save();
      }
    }

    // Xử lý áp dụng voucher mới (nếu chưa được áp dụng trước đó cho đơn này)
    if (appliedVoucherDoc) {
      const isSameVoucherOnExistingOrder = existingOrder && existingOrder.voucherCode?.toUpperCase().trim() === appliedVoucherDoc.code.toUpperCase().trim();
      if (!isSameVoucherOnExistingOrder) {
        appliedVoucherDoc.usedCount += 1;
        if (!appliedVoucherDoc.usedByUsers.some(id => id.toString() === userId)) {
          appliedVoucherDoc.usedByUsers.push(userId);
        }
        await appliedVoucherDoc.save();
      }
    }

    if (existingOrder) {
      // Cập nhật đơn hàng hiện có
      existingOrder.orderType = orderType as any;
      existingOrder.totalPrice = totalPrice;
      existingOrder.voucherCode = voucherCode ? voucherCode.toUpperCase().trim() : "";
      existingOrder.discountAmount = discountAmount;
      existingOrder.vipDiscountAmount = vipDiscountAmount;
      existingOrder.vipLevelAtOrder = vipPackage?.name || "Thành viên thường";
      existingOrder.isConfirmed = true; // Đã thanh toán
      await existingOrder.save();

      await OrderItem.deleteMany({ orderId: existingOrder._id });

      // Tạo các order items mới
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

    // Tạo đơn hàng mới (ở trạng thái đã xác nhận/thanh toán ngay)
    const order = new Order({
      userId,
      dailyMenuId: menu._id,
      orderType: orderType as any,
      totalPrice,
      voucherCode: voucherCode ? voucherCode.toUpperCase().trim() : "",
      discountAmount,
      vipDiscountAmount,
      vipLevelAtOrder: vipPackage?.name || "Thành viên thường",
      isConfirmed: true, // Thanh toán tức thì thành công
      orderedAt: new Date(),
    });
    await order.save();

    // Tạo các order items mới
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
      message: "Đặt cơm và thanh toán thành công!",
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
      .populate("userId", "name email avatar")
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
        .populate("userId", "name email avatar")
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

    // Cập nhật hàng loạt tất cả đơn đặt cơm của menu này sang trạng thái đã xác nhận (isConfirmed = true)
    await Order.updateMany(
      { dailyMenuId: menuId, isConfirmed: false },
      { $set: { isConfirmed: true } }
    );

    // Khóa menu và thông báo cho mọi người
    menu.isLocked = true;
    await menu.save();

    socketService.emitAll("menu_locked", {
      menuId: menuId,
      message: "Menu hôm nay đã chính thức đóng. Chúc các bạn ngon miệng!",
    });

    res.json({
      success: true,
      message: `Đã chốt và khóa thực đơn thành công!`,
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
      `📋 TỔNG HỢP: ${totalMeals} phần`,
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

    // Kiểm tra xem menu hôm nay đã bị khóa chưa
    const menu = await DailyMenu.findById(order.dailyMenuId);
    if (!menu) {
      throw new ServiceError("MENU_NOT_FOUND", "Không tìm thấy thực đơn tương ứng", 404);
    }

    if (menu.isLocked) {
      throw new ServiceError(
        "MENU_LOCKED",
        "Thực đơn đã bị khóa, không thể hủy đơn cơm lúc này",
        400,
      );
    }

    // Hoàn tiền đặt cơm vào ví của khách hàng và khấu trừ tích lũy VIP
    const refundAmount = order.totalPrice ?? 0;
    if (refundAmount > 0) {
      let wallet = await Wallet.findOne({ userId: order.userId });
      if (!wallet) {
        wallet = await Wallet.create({ userId: order.userId, balance: 0 });
      }
      wallet.balance += refundAmount;
      await wallet.save();
    }

    // Khôi phục mã giảm giá (nếu có dùng)
    if (order.voucherCode) {
      const voucher = await Voucher.findOne({
        code: order.voucherCode.toUpperCase().trim()
      });
      if (voucher) {
        voucher.usedCount = Math.max(0, voucher.usedCount - 1);
        voucher.usedByUsers = voucher.usedByUsers.filter(id => id.toString() !== order.userId.toString());
        await voucher.save();
      }
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