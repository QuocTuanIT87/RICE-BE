// Statistics Controller - Thống kê
import { Request, Response, NextFunction } from "express";
import { Order } from "../orders/order.model";
import { OrderItem } from "../orders/orderItem.model";
import { PackagePurchaseRequest } from "../packagePurchases/packagePurchaseRequest.model";
import { DailyMenu } from "../dailyMenus/dailyMenu.model";
import { User } from "../auth/user.model";
import { UserPackage } from "../userPackages/userPackage.model";
import { getStartOfDay, getEndOfDay } from "../../utils";

/**
 * GET /api/statistics/revenue
 * Thống kê doanh thu (Admin)
 */
export const getRevenue = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { period = "day", date } = req.query; // period: day, month, year

    let startDate: Date;
    let endDate: Date;
    const baseDate = date ? new Date(date as string) : new Date();

    if (period === "day") {
      startDate = getStartOfDay(baseDate);
      endDate = getEndOfDay(baseDate);
    } else if (period === "month") {
      startDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
      endDate = new Date(
        baseDate.getFullYear(),
        baseDate.getMonth() + 1,
        0,
        23,
        59,
        59,
      );
    } else {
      // year
      startDate = new Date(baseDate.getFullYear(), 0, 1);
      endDate = new Date(baseDate.getFullYear(), 11, 31, 23, 59, 59);
    }

    // Lấy các yêu cầu mua gói đã duyệt trong khoảng thời gian
    const approvedRequests = await PackagePurchaseRequest.find({
      status: "approved",
      processedAt: { $gte: startDate, $lte: endDate },
    }).populate("mealPackageId");

    // Tính doanh thu
    let totalRevenue = 0;
    const revenueByPackage: {
      [key: string]: { name: string; count: number; revenue: number };
    } = {};

    for (const request of approvedRequests) {
      const pkg = request.mealPackageId as any;
      if (!pkg) continue;

      totalRevenue += pkg.price;

      const pkgId = pkg._id.toString();
      if (!revenueByPackage[pkgId]) {
        revenueByPackage[pkgId] = { name: pkg.name, count: 0, revenue: 0 };
      }
      revenueByPackage[pkgId].count += 1;
      revenueByPackage[pkgId].revenue += pkg.price;
    }

    // Tổng số đơn đặt cơm trong khoảng thời gian
    const menus = await DailyMenu.find({
      menuDate: { $gte: startDate, $lte: endDate },
    });
    const menuIds = menus.map((m) => m._id);
    const totalOrders = await Order.countDocuments({
      dailyMenuId: { $in: menuIds },
      isConfirmed: true,
    });

    res.json({
      success: true,
      data: {
        period,
        startDate,
        endDate,
        totalRevenue,
        totalPackagesSold: approvedRequests.length,
        totalOrders,
        breakdown: Object.values(revenueByPackage),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/statistics/menu-items
 * Thống kê món ăn phổ biến (Admin)
 */
export const getMenuItemStats = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { startDate, endDate } = req.query;

    let start = startDate ? new Date(startDate as string) : new Date();
    let end = endDate ? new Date(endDate as string) : new Date();

    start = getStartOfDay(start);
    end = getEndOfDay(end);

    // Lấy tất cả menu trong khoảng thời gian
    const menus = await DailyMenu.find({
      menuDate: { $gte: start, $lte: end },
    });

    const menuIds = menus.map((m) => m._id);

    // Lấy tất cả orders của các menu này
    const orders = await Order.find({
      dailyMenuId: { $in: menuIds },
    });

    const orderIds = orders.map((o) => o._id);

    // Lấy tất cả order items
    const orderItems = await OrderItem.find({
      orderId: { $in: orderIds },
    }).populate("menuItemId");

    // Tổng hợp
    const itemStats: { [key: string]: { name: string; count: number } } = {};

    for (const item of orderItems) {
      const menuItem = item.menuItemId as any;
      if (!menuItem) continue;

      const itemId = menuItem._id.toString();
      if (!itemStats[itemId]) {
        itemStats[itemId] = { name: menuItem.name, count: 0 };
      }
      itemStats[itemId].count += item.quantity;
    }

    const sortedStats = Object.values(itemStats).sort(
      (a, b) => b.count - a.count,
    );

    res.json({
      success: true,
      data: {
        startDate: start,
        endDate: end,
        totalOrders: orders.length,
        items: sortedStats,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/statistics/dashboard
 * Tổng quan dashboard (Admin)
 */
export const getDashboard = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const today = new Date();
    const startOfToday = getStartOfDay(today);
    const endOfToday = getEndOfDay(today);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Tổng số người dùng
    const totalUsers = await User.countDocuments();

    // Số gói đang hoạt động
    const activePackages = await UserPackage.countDocuments({
      isActive: true,
      expiresAt: { $gt: today },
      remainingTurns: { $gt: 0 },
    });

    // Số menu hôm nay
    const todayMenus = await DailyMenu.countDocuments({
      menuDate: { $gte: startOfToday, $lte: endOfToday },
    });

    // Đơn hôm nay
    const todayMenuList = await DailyMenu.find({
      menuDate: { $gte: startOfToday, $lte: endOfToday },
    });
    const todayMenuIds = todayMenuList.map((m) => m._id);
    const todayOrders = await Order.countDocuments({
      dailyMenuId: { $in: todayMenuIds },
    });

    // Yêu cầu mua gói pending
    const pendingRequests = await PackagePurchaseRequest.countDocuments({
      status: "pending",
    });

    // Doanh thu tháng này
    const monthlyRequests = await PackagePurchaseRequest.find({
      status: "approved",
      processedAt: { $gte: startOfMonth, $lte: endOfToday },
    }).populate("mealPackageId");

    let monthlyRevenue = 0;
    for (const req of monthlyRequests) {
      const pkg = req.mealPackageId as any;
      if (pkg) monthlyRevenue += pkg.price;
    }

    // Top món ăn trong tháng
    const monthlyMenus = await DailyMenu.find({
      menuDate: { $gte: startOfMonth, $lte: endOfToday },
    });
    const monthlyMenuIds = monthlyMenus.map((m) => m._id);
    const monthlyOrders = await Order.find({
      dailyMenuId: { $in: monthlyMenuIds },
    });
    const monthlyOrderIds = monthlyOrders.map((o) => o._id);
    const monthlyOrderItems = await OrderItem.find({
      orderId: { $in: monthlyOrderIds },
    }).populate("menuItemId");

    const itemStats: { [key: string]: { name: string; count: number } } = {};
    for (const item of monthlyOrderItems) {
      const menuItem = item.menuItemId as any;
      if (!menuItem) continue;
      const itemId = menuItem._id.toString();
      if (!itemStats[itemId]) {
        itemStats[itemId] = { name: menuItem.name, count: 0 };
      }
      itemStats[itemId].count += item.quantity;
    }
    const topItems = Object.values(itemStats)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    res.json({
      success: true,
      data: {
        totalUsers,
        activePackages,
        todayMenus,
        todayOrders,
        pendingPurchaseRequests: pendingRequests,
        monthlyRevenue,
        topItems,
      },
    });
  } catch (error) {
    next(error);
  }
};
