import { Request, Response, NextFunction } from "express";
import { UserMembership } from "./userMembership.model";
import { VipPackage } from "../vipPackages/vipPackage.model";
import { Wallet } from "../wallets/wallet.model";
import { ServiceError } from "../../middlewares";
import { socketService } from "../../services";
import { User } from "../auth/user.model";
import { Notification } from "../notifications/notification.model";

/**
 * POST /api/user-memberships/buy-with-wallet
 * Mua gói Hội Viên VIP bằng số dư ví hiện có
 */
export const buyWithWallet = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { vipPackageId } = req.body;
    const userId = req.user!.userId;

    if (!vipPackageId) {
      throw new ServiceError("MISSING_PACKAGE_ID", "Vui lòng chọn gói VIP cần mua", 400);
    }

    const pkg = await VipPackage.findById(vipPackageId);
    if (!pkg || !pkg.isActive) {
      throw new ServiceError("PACKAGE_NOT_FOUND", "Không tìm thấy gói VIP này hoặc gói đã dừng bán", 404);
    }

    // Lấy ví của user
    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      wallet = await Wallet.create({ userId, balance: 0 });
    }

    // Kiểm tra số dư ví
    if (wallet.balance < pkg.price) {
      throw new ServiceError(
        "INSUFFICIENT_BALANCE",
        `Số dư ví không đủ. Gói VIP cần ${pkg.price.toLocaleString("vi-VN")} VND. Ví hiện tại chỉ có ${wallet.balance.toLocaleString("vi-VN")} VND. Vui lòng nạp thêm tiền!`,
        400
      );
    }

    // Thực hiện trừ phí mua gói
    wallet.balance -= pkg.price;
    await wallet.save();

    // Kiểm tra xem đã có gói hội viên đang hoạt động chưa
    let membership = await UserMembership.findOne({
      userId,
      isActive: true,
      expiresAt: { $gt: new Date() },
    });

    const now = new Date();
    if (membership) {
      // Nếu trùng gói cũ: Cộng dồn thời hạn
      if (membership.vipPackageId.toString() === pkg._id.toString()) {
        membership.expiresAt = new Date(membership.expiresAt.getTime() + pkg.validDays * 24 * 60 * 60 * 1000);
      } else {
        // Khác gói cũ: Ghi đè gói mới, tính lại thời hạn từ đầu
        membership.vipPackageId = pkg._id as any;
        membership.activatedAt = now;
        membership.expiresAt = new Date(now.getTime() + pkg.validDays * 24 * 60 * 60 * 1000);
      }
    } else {
      // Chưa có gói: Tạo mới
      membership = new UserMembership({
        userId,
        vipPackageId: pkg._id,
        activatedAt: now,
        expiresAt: new Date(now.getTime() + pkg.validDays * 24 * 60 * 60 * 1000),
        isActive: true,
      });
    }

    await membership.save();

    // Phát tín hiệu Socket thông báo cập nhật ví tiền & trạng thái VIP
    socketService.emitToUser(userId, "coins_updated", {
      balance: wallet.balance,
    });

    res.json({
      success: true,
      message: `Chúc mừng đạo hữu đã sở hữu ${pkg.name} thành công!`,
      data: {
        membership,
        balance: wallet.balance,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/user-memberships/my
 * Lấy gói Hội Viên VIP đang hoạt động của tôi
 */
export const getMyMembership = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const membership = await UserMembership.findOne({
      userId,
      isActive: true,
      expiresAt: { $gt: new Date() },
    }).populate("vipPackageId");

    res.json({
      success: true,
      data: membership,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/user-memberships/gift
 * Tặng gói Hội Viên VIP cho đồng nghiệp khác
 */
export const giftMembership = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { receiverId, vipPackageId } = req.body;
    const senderId = req.user!.userId;

    if (!receiverId) {
      throw new ServiceError("MISSING_RECEIVER_ID", "Vui lòng chọn người nhận gói VIP", 400);
    }

    if (!vipPackageId) {
      throw new ServiceError("MISSING_PACKAGE_ID", "Vui lòng chọn gói VIP cần tặng", 400);
    }

    if (receiverId === senderId) {
      throw new ServiceError("INVALID_RECEIVER", "Đạo hữu không thể tự tặng gói VIP cho chính mình", 400);
    }

    const [pkg, receiver, sender] = await Promise.all([
      VipPackage.findById(vipPackageId),
      User.findById(receiverId),
      User.findById(senderId),
    ]);

    if (!pkg || !pkg.isActive) {
      throw new ServiceError("PACKAGE_NOT_FOUND", "Không tìm thấy gói VIP này hoặc gói đã dừng bán", 404);
    }

    if (!receiver) {
      throw new ServiceError("RECEIVER_NOT_FOUND", "Không tìm thấy tài khoản người nhận", 404);
    }

    if (!sender) {
      throw new ServiceError("SENDER_NOT_FOUND", "Không tìm thấy tài khoản người gửi", 404);
    }

    // Lấy ví của người tặng (sender)
    let senderWallet = await Wallet.findOne({ userId: senderId });
    if (!senderWallet) {
      senderWallet = await Wallet.create({ userId: senderId, balance: 0 });
    }

    // Kiểm tra số dư ví người tặng
    if (senderWallet.balance < pkg.price) {
      throw new ServiceError(
        "INSUFFICIENT_BALANCE",
        `Số dư ví của bạn không đủ để tặng. Gói VIP cần ${pkg.price.toLocaleString("vi-VN")} VND. Ví hiện tại chỉ có ${senderWallet.balance.toLocaleString("vi-VN")} VND. Vui lòng nạp thêm tiền!`,
        400
      );
    }

    // Trực tiếp trừ ví của người tặng
    senderWallet.balance -= pkg.price;
    await senderWallet.save();

    // Tìm gói hội viên đang hoạt động của người nhận
    let membership = await UserMembership.findOne({
      userId: receiverId,
      isActive: true,
      expiresAt: { $gt: new Date() },
    });

    const now = new Date();
    if (membership) {
      // Nếu trùng gói cũ: Cộng dồn thời hạn
      if (membership.vipPackageId.toString() === pkg._id.toString()) {
        membership.expiresAt = new Date(membership.expiresAt.getTime() + pkg.validDays * 24 * 60 * 60 * 1000);
      } else {
        // Khác gói cũ: Ghi đè gói mới, tính lại thời hạn từ đầu
        membership.vipPackageId = pkg._id as any;
        membership.activatedAt = now;
        membership.expiresAt = new Date(now.getTime() + pkg.validDays * 24 * 60 * 60 * 1000);
      }
    } else {
      // Chưa có gói: Tạo mới
      membership = new UserMembership({
        userId: receiverId,
        vipPackageId: pkg._id,
        activatedAt: now,
        expiresAt: new Date(now.getTime() + pkg.validDays * 24 * 60 * 60 * 1000),
        isActive: true,
      });
    }

    await membership.save();

    // Tạo thông báo cho người nhận (receiver)
    const newNotif = new Notification({
      userId: receiverId,
      title: "🎁 Nhận quà tặng VIP",
      content: `Đạo hữu ${sender.name} đã tặng bạn gói hội viên VIP ${pkg.name} thời hạn ${pkg.validDays} ngày. Chúc mừng đạo hữu!`,
      type: "gift",
      isRead: false,
    });
    await newNotif.save();

    // Phát tín hiệu Socket cho người tặng (cập nhật ví tiền)
    socketService.emitToUser(senderId, "coins_updated", {
      balance: senderWallet.balance,
    });

    // Phát tín hiệu Socket cho người nhận (thông báo realtime)
    const notifObj = newNotif.toObject();
    notifObj.isRead = false;
    delete notifObj.readBy;
    socketService.emitToUser(receiverId, "notification_received", notifObj);

    res.json({
      success: true,
      message: `Tặng ${pkg.name} cho đạo hữu ${receiver.name} thành công!`,
      data: {
        balance: senderWallet.balance,
      },
    });
  } catch (error) {
    next(error);
  }
};

