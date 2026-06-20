import { Request, Response, NextFunction } from "express";
import { User } from "../auth/user.model";
import { Friendship } from "./friendship.model";
import { Follow } from "./follow.model";
import { Post } from "../forum/post.model";
import { Notification } from "../notifications/notification.model";
import { socketService } from "../../services";
import { ServiceError } from "../../middlewares";
import { UserMembership } from "../userMemberships/userMembership.model";
import { Wallet } from "../wallets/wallet.model";
import mongoose from "mongoose";

/**
 * Helper helper to send a socket-notified personal alert notification
 */
const createAndSendNotification = async (
  userId: string,
  title: string,
  content: string,
  type: "system" | "gift" | "alert" = "system"
) => {
  try {
    const newNotif = new Notification({
      userId,
      title,
      content,
      type,
      isRead: false,
      readBy: [],
    });
    await newNotif.save();
    
    const notifObj = newNotif.toObject();
    notifObj.isRead = false;
    delete notifObj.readBy;

    socketService.emitToUser(userId, "notification_received", notifObj);
  } catch (error) {
    console.error("Failed to send social notification:", error);
  }
};

/**
 * POST /api/social/friends/request/:userId
 * Gửi lời mời kết bạn (hoặc tự động đồng ý nếu đối phương đã gửi trước đó)
 */
export const sendFriendRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const currentUserId = (req as any).user?.userId;
    const targetUserId = req.params.userId;

    if (currentUserId === targetUserId) {
      throw new ServiceError("CANNOT_FRIEND_SELF", "Đạo hữu không thể tự kết bạn với chính mình", 400);
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      throw new ServiceError("USER_NOT_FOUND", "Không tìm thấy người dùng này", 404);
    }

    // Kiểm tra xem đã có mối quan hệ chưa
    const existingRelation = await Friendship.findOne({
      $or: [
        { requester: currentUserId, recipient: targetUserId },
        { requester: targetUserId, recipient: currentUserId },
      ],
    });

    if (existingRelation) {
      if (existingRelation.status === "accepted") {
        res.json({ success: true, message: "Hai người đã là bạn bè từ trước" });
        return;
      }
      
      if (existingRelation.status === "pending") {
        if (existingRelation.requester.toString() === currentUserId) {
          res.json({ success: true, message: "Lời mời kết bạn đã ở trạng thái chờ duyệt" });
          return;
        } else {
          // Đối phương đã gửi lời mời trước đó -> Tự động chấp nhận lời mời này!
          existingRelation.status = "accepted";
          await existingRelation.save();

          // Tự động follow chéo
          await Promise.all([
            Follow.findOneAndUpdate({ follower: currentUserId, following: targetUserId }, {}, { upsert: true }),
            Follow.findOneAndUpdate({ follower: targetUserId, following: currentUserId }, {}, { upsert: true }),
          ]);

          const currentUser = await User.findById(currentUserId);
          await createAndSendNotification(
            targetUserId,
            "🤝 Chấp nhận kết bạn!",
            `Đạo hữu ${currentUser?.name || "Bạn bè"} đã đồng ý lời mời kết bạn của bạn!`
          );

          res.json({
            success: true,
            message: "Đồng ý kết bạn thành công (Do đối phương đã gửi yêu cầu trước đó)!",
            data: existingRelation,
          });
          return;
        }
      }
    }

    // Tạo mối quan hệ mới ở dạng pending
    const newFriendship = new Friendship({
      requester: currentUserId,
      recipient: targetUserId,
      status: "pending",
    });
    await newFriendship.save();

    // Gửi thông báo đến recipient
    const currentUser = await User.findById(currentUserId);
    await createAndSendNotification(
      targetUserId,
      "👋 Lời mời kết bạn mới!",
      `Đạo hữu ${currentUser?.name || "Đồng nghiệp"} đã gửi cho bạn lời mời kết bạn.`
    );

    res.status(201).json({
      success: true,
      message: "Gửi lời mời kết bạn thành công!",
      data: newFriendship,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/social/friends/accept/:userId
 * Chấp nhận kết bạn
 */
export const acceptFriendRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const currentUserId = (req as any).user?.userId;
    const requesterId = req.params.userId;

    const friendship = await Friendship.findOne({
      requester: requesterId,
      recipient: currentUserId,
      status: "pending",
    });

    if (!friendship) {
      throw new ServiceError("REQUEST_NOT_FOUND", "Không tìm thấy lời mời kết bạn tương ứng", 404);
    }

    friendship.status = "accepted";
    await friendship.save();

    // Tự động thiết lập theo dõi chéo
    await Promise.all([
      Follow.findOneAndUpdate({ follower: currentUserId, following: requesterId }, {}, { upsert: true }),
      Follow.findOneAndUpdate({ follower: requesterId, following: currentUserId }, {}, { upsert: true }),
    ]);

    // Gửi thông báo đến requester
    const currentUser = await User.findById(currentUserId);
    await createAndSendNotification(
      requesterId,
      "🤝 Chấp nhận kết bạn!",
      `Đạo hữu ${currentUser?.name || "Bạn bè"} đã đồng ý lời mời kết bạn của bạn!`
    );

    res.json({
      success: true,
      message: "Đồng ý lời mời kết bạn thành công!",
      data: friendship,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/social/friends/decline/:userId
 * Từ chối lời mời kết bạn (Hoặc thu hồi yêu cầu đã gửi)
 */
export const declineFriendRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const currentUserId = (req as any).user?.userId;
    const targetUserId = req.params.userId;

    // Hủy hoặc từ chối ở cả 2 chiều nếu đang ở trạng thái pending
    const deletedRelation = await Friendship.findOneAndDelete({
      $or: [
        { requester: currentUserId, recipient: targetUserId, status: "pending" },
        { requester: targetUserId, recipient: currentUserId, status: "pending" },
      ],
    });

    if (!deletedRelation) {
      throw new ServiceError("REQUEST_NOT_FOUND", "Không tìm thấy lời mời kết bạn cần hủy", 404);
    }

    res.json({
      success: true,
      message: "Đã hủy/từ chối lời mời kết bạn thành công!",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/social/friends/unfriend/:userId
 * Hủy kết bạn
 */
export const unfriend = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const currentUserId = (req as any).user?.userId;
    const targetUserId = req.params.userId;

    const deletedRelation = await Friendship.findOneAndDelete({
      $or: [
        { requester: currentUserId, recipient: targetUserId, status: "accepted" },
        { requester: targetUserId, recipient: currentUserId, status: "accepted" },
      ],
    });

    if (!deletedRelation) {
      throw new ServiceError("NOT_FRIENDS", "Hai người không ở trạng thái bạn bè", 400);
    }

    // Tự động xóa luôn follow chéo
    await Promise.all([
      Follow.findOneAndDelete({ follower: currentUserId, following: targetUserId }),
      Follow.findOneAndDelete({ follower: targetUserId, following: currentUserId }),
    ]);

    res.json({
      success: true,
      message: "Hủy kết bạn thành công!",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/social/friends/requests
 * Lấy danh sách lời mời kết bạn (gồm lời mời đã nhận và đã gửi)
 */
export const getFriendRequests = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const currentUserId = (req as any).user?.userId;

    // Lời mời nhận được (incoming)
    const incomingRequests = await Friendship.find({
      recipient: currentUserId,
      status: "pending",
    }).populate("requester", "name email avatar role");

    // Lời mời đã gửi (outgoing)
    const outgoingRequests = await Friendship.find({
      requester: currentUserId,
      status: "pending",
    }).populate("recipient", "name email avatar role");

    res.json({
      success: true,
      data: {
        incoming: incomingRequests.map(r => r.requester),
        outgoing: outgoingRequests.map(r => r.recipient),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/social/friends/list
 * Lấy danh sách bạn bè
 */
export const getFriendsList = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const currentUserId = (req as any).user?.userId;

    const friendships = await Friendship.find({
      $or: [
        { requester: currentUserId, status: "accepted" },
        { recipient: currentUserId, status: "accepted" },
      ],
    })
      .populate("requester", "name email avatar role")
      .populate("recipient", "name email avatar role");

    const friends = friendships.map((f) => {
      const isRequester = f.requester._id.toString() === currentUserId;
      return isRequester ? f.recipient : f.requester;
    });

    res.json({
      success: true,
      data: friends,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/social/follow/:userId
 * Theo dõi người dùng
 */
export const followUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const currentUserId = (req as any).user?.userId;
    const targetUserId = req.params.userId;

    if (currentUserId === targetUserId) {
      throw new ServiceError("CANNOT_FOLLOW_SELF", "Đạo hữu không thể tự theo dõi chính mình", 400);
    }

    const follow = await Follow.findOneAndUpdate(
      { follower: currentUserId, following: targetUserId },
      {},
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: "Đang theo dõi người dùng này",
      data: follow,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/social/unfollow/:userId
 * Hủy theo dõi người dùng
 */
export const unfollowUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const currentUserId = (req as any).user?.userId;
    const targetUserId = req.params.userId;

    await Follow.findOneAndDelete({
      follower: currentUserId,
      following: targetUserId,
    });

    res.json({
      success: true,
      message: "Đã hủy theo dõi người dùng này",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/social/profile/:userId
 * Lấy hồ sơ chi tiết trang cá nhân công khai của người dùng khác
 */
export const getPublicProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const currentUserId = (req as any).user?.userId;
    const targetUserId = req.params.userId;

    const targetUser = await User.findById(targetUserId)
      .select("-password")
      .populate("vipCosmetics");

    if (!targetUser) {
      throw new ServiceError("USER_NOT_FOUND", "Không tìm thấy người dùng này", 404);
    }

    // Tính ví và hội viên của người này
    const [wallet, membership, friendsCount, followersCount, followingCount] = await Promise.all([
      Wallet.findOne({ userId: targetUserId }),
      UserMembership.findOne({
        userId: targetUserId,
        isActive: true,
        expiresAt: { $gt: new Date() },
      }).populate("vipPackageId"),
      
      // Số lượng bạn bè
      Friendship.countDocuments({
        $or: [
          { requester: targetUserId, status: "accepted" },
          { recipient: targetUserId, status: "accepted" },
        ],
      }),

      // Số lượng người theo dõi (followers)
      Follow.countDocuments({ following: targetUserId }),

      // Số lượng người đang theo dõi (following)
      Follow.countDocuments({ follower: targetUserId }),
    ]);

    // Trạng thái tình trạng bạn bè của người đang xem với người này
    let friendStatus: "none" | "pending_sent" | "pending_received" | "friends" = "none";
    const friendship = await Friendship.findOne({
      $or: [
        { requester: currentUserId, recipient: targetUserId },
        { requester: targetUserId, recipient: currentUserId },
      ],
    });

    if (friendship) {
      if (friendship.status === "accepted") {
        friendStatus = "friends";
      } else if (friendship.status === "pending") {
        friendStatus = friendship.requester.toString() === currentUserId ? "pending_sent" : "pending_received";
      }
    }

    // Trạng thái theo dõi
    const followRecord = await Follow.findOne({
      follower: currentUserId,
      following: targetUserId,
    });
    const isFollowing = !!followRecord;

    // 5 bài đăng gần nhất trên diễn đàn
    const recentPosts = await Post.find({ userId: targetUserId })
      .sort({ createdAt: -1 })
      .limit(5);

    const userObj = {
      ...targetUser.toObject(),
      balance: wallet?.balance || 0,
      hasMembership: !!membership,
      membershipName: (membership?.vipPackageId as any)?.name || "",
      membershipExpiresAt: membership?.expiresAt || null,
      vipDiscountRate: (membership?.vipPackageId as any)?.discountAmount || 0,
    };

    res.json({
      success: true,
      data: {
        user: userObj,
        friendsCount,
        followersCount,
        followingCount,
        friendStatus,
        isFollowing,
        recentPosts,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/social/followers
 * Lấy danh sách người theo dõi (followers)
 */
export const getFollowersList = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const currentUserId = (req as any).user?.userId;
    const follows = await Follow.find({ following: currentUserId })
      .populate("follower", "name email avatar role");

    res.json({
      success: true,
      data: follows.map((f) => f.follower).filter(Boolean),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/social/following
 * Lấy danh sách người đang theo dõi (following)
 */
export const getFollowingList = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const currentUserId = (req as any).user?.userId;
    const follows = await Follow.find({ follower: currentUserId })
      .populate("following", "name email avatar role");

    res.json({
      success: true,
      data: follows.map((f) => f.following).filter(Boolean),
    });
  } catch (error) {
    next(error);
  }
};

