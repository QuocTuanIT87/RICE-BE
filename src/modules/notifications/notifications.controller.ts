import { Request, Response, NextFunction } from "express";
import { Notification } from "./notification.model";
import { socketService } from "../../services";
import { ServiceError } from "../../middlewares";

/**
 * GET /api/notifications
 * Lấy danh sách thông báo (thông báo cá nhân & thông báo chung)
 */
export const getNotifications = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user!.userId;

    // Tìm thông báo cá nhân trỏ tới user hoặc thông báo chung (userId = null)
    const notifications = await Notification.find({
      $or: [{ userId }, { userId: null }],
    }).sort({ createdAt: -1 });

    // Cập nhật thuộc tính ảo isRead cho thông báo chung
    const mappedNotifications = notifications.map((notif) => {
      const notifObj = notif.toObject();
      if (notifObj.userId === null) {
        notifObj.isRead = notifObj.readBy?.some((id: any) => id.toString() === userId) || false;
      }
      // Dọn dẹp readBy để không gửi danh sách ID rườm rà về client
      delete notifObj.readBy;
      return notifObj;
    });

    res.json({
      success: true,
      data: mappedNotifications,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/notifications/:id/read
 * Đánh dấu đã đọc một thông báo
 */
export const markAsRead = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const notif = await Notification.findById(id);
    if (!notif) {
      throw new ServiceError("NOTIFICATION_NOT_FOUND", "Không tìm thấy thông báo này", 404);
    }

    if (notif.userId === null) {
      // Thông báo chung -> Thêm userId vào readBy
      await Notification.findByIdAndUpdate(id, {
        $addToSet: { readBy: userId },
      });
    } else {
      // Thông báo cá nhân
      if (notif.userId.toString() !== userId) {
        throw new ServiceError("UNAUTHORIZED", "Bạn không có quyền đọc thông báo này", 403);
      }
      notif.isRead = true;
      await notif.save();
    }

    res.json({
      success: true,
      message: "Đã đánh dấu đọc thông báo thành công",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/notifications/read-all
 * Đánh dấu đã đọc tất cả thông báo
 */
export const markAllAsRead = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user!.userId;

    await Promise.all([
      // Đọc tất cả thông báo cá nhân
      Notification.updateMany({ userId, isRead: false }, { isRead: true }),
      // Đọc tất cả thông báo chung mà user chưa có trong readBy
      Notification.updateMany(
        { userId: null, readBy: { $ne: userId as any } },
        { $addToSet: { readBy: userId } }
      ),
    ]);

    res.json({
      success: true,
      message: "Đã đánh dấu đọc tất cả thông báo",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/notifications
 * Admin tạo thông báo hệ thống và gửi realtime qua Socket.io
 */
export const createNotification = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { userId, title, content, type } = req.body;

    if (!title || !content) {
      throw new ServiceError("MISSING_FIELDS", "Tiêu đề và nội dung thông báo là bắt buộc", 400);
    }

    const newNotif = new Notification({
      userId: userId || null,
      title,
      content,
      type: type || "system",
      isRead: false,
      readBy: [],
    });

    await newNotif.save();

    // Map object để gửi về client (isRead = false mặc định)
    const notifObj = newNotif.toObject();
    notifObj.isRead = false;
    delete notifObj.readBy;

    // Realtime emit
    if (newNotif.userId === null) {
      // Gửi cho tất cả
      socketService.emitAll("notification_received", notifObj);
    } else {
      // Gửi cho user cụ thể
      socketService.emitToUser(newNotif.userId.toString(), "notification_received", notifObj);
    }

    res.status(201).json({
      success: true,
      message: "Tạo thông báo thành công!",
      data: notifObj,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/notifications/admin
 * Admin lấy toàn bộ danh sách thông báo đã gửi
 */
export const getAdminNotifications = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const notifications = await Notification.find({})
      .populate("userId", "name email avatar")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: notifications,
    });
  } catch (error) {
    next(error);
  }
};

