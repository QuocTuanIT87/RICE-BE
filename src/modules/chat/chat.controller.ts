import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { Message } from "./message.model";
import { User } from "../auth/user.model";
import { uploadToCloudinary, socketService } from "../../services";
import { ServiceError } from "../../middlewares";
import { Block } from "../social/block.model";

/**
 * Lấy danh sách cuộc hội thoại của người dùng hiện tại
 */
export const getConversations = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      throw new ServiceError("UNAUTHORIZED", "Không có quyền truy cập", 401);
    }

    const conversations = await Message.aggregate([
      {
        $match: {
          $or: [
            { senderId: new mongoose.Types.ObjectId(userId) },
            { receiverId: new mongoose.Types.ObjectId(userId) }
          ]
        }
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ["$senderId", new mongoose.Types.ObjectId(userId)] },
              "$receiverId",
              "$senderId"
            ]
          },
          lastMessage: { $first: "$$ROOT" },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$receiverId", new mongoose.Types.ObjectId(userId)] },
                    { $eq: ["$isRead", false] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },
      { $sort: { "lastMessage.createdAt": -1 } }
    ]);

    // Populate thông tin người dùng của đối phương
    const populated = await User.populate(conversations, {
      path: "_id",
      select: "name email avatar role"
    });

    // Populate vipCosmetics của đối phương
    const populatedWithCosmetics = await User.populate(populated, {
      path: "_id.vipCosmetics",
      model: "VipCosmetics"
    });

    // Định dạng lại dữ liệu trả về cho frontend dễ xử lý
    const results = (populatedWithCosmetics as any[]).map((conv) => {
      return {
        otherUser: conv._id,
        lastMessage: conv.lastMessage,
        unreadCount: conv.unreadCount
      };
    });

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Lấy lịch sử tin nhắn giữa người dùng hiện tại và một đối phương cụ thể
 */
export const getMessages = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const { partnerId } = req.params;

    if (!userId) {
      throw new ServiceError("UNAUTHORIZED", "Không có quyền truy cập", 401);
    }
    if (!partnerId) {
      throw new ServiceError("BAD_REQUEST", "Thiếu partnerId", 400);
    }

    // Đánh dấu tất cả tin nhắn gửi từ partner cho mình là đã đọc (isRead: true)
    await Message.updateMany(
      {
        senderId: new mongoose.Types.ObjectId(partnerId),
        receiverId: new mongoose.Types.ObjectId(userId),
        isRead: false
      },
      { $set: { isRead: true } }
    );

    // Lấy tin nhắn
    const messages = await Message.find({
      $or: [
        { senderId: userId, receiverId: partnerId },
        { senderId: partnerId, receiverId: userId }
      ]
    }).sort({ createdAt: 1 });

    res.json({
      success: true,
      data: messages
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Gửi tin nhắn mới (hỗ trợ đính kèm hình ảnh)
 */
export const sendMessage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const { receiverId, content } = req.body;

    if (!userId) {
      throw new ServiceError("UNAUTHORIZED", "Không có quyền truy cập", 401);
    }
    if (!receiverId) {
      throw new ServiceError("BAD_REQUEST", "Thiếu người nhận", 400);
    }

    // Kiểm tra xem một trong hai người có chặn người kia không
    const blockExists = await Block.findOne({
      $or: [
        { blocker: userId, blocked: receiverId },
        { blocker: receiverId, blocked: userId }
      ]
    });

    if (blockExists) {
      throw new ServiceError("FORBIDDEN", "Không thể gửi tin nhắn do đã chặn cuộc trò chuyện", 403);
    }

    let imageUrl = undefined;
    if (req.file) {
      imageUrl = await uploadToCloudinary(req.file.buffer, "rice-order/chat");
    }

    const message = new Message({
      senderId: userId,
      receiverId,
      content: content || "",
      imageUrl,
      isRead: false,
      isRecalled: false,
      reactions: []
    });

    const savedMessage = await message.save();

    // Phát sự kiện socket thời gian thực
    socketService.emitToUser(receiverId, "chat_message", savedMessage);
    socketService.emitToUser(userId, "chat_message", savedMessage);

    res.status(201).json({
      success: true,
      data: savedMessage
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Thu hồi tin nhắn
 */
export const recallMessage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const { messageId } = req.params;

    if (!userId) {
      throw new ServiceError("UNAUTHORIZED", "Không có quyền truy cập", 401);
    }

    const message = await Message.findById(messageId);
    if (!message) {
      throw new ServiceError("NOT_FOUND", "Không tìm thấy tin nhắn", 404);
    }

    // Chỉ người gửi mới được quyền thu hồi tin nhắn của chính mình
    if (message.senderId.toString() !== userId) {
      throw new ServiceError("FORBIDDEN", "Bạn không có quyền thu hồi tin nhắn này", 403);
    }

    message.isRecalled = true;
    message.content = "Tin nhắn đã bị thu hồi";
    message.imageUrl = undefined;
    message.reactions = []; // Xóa cảm xúc của tin nhắn đã thu hồi

    const updatedMessage = await message.save();

    const receiverIdStr = message.receiverId.toString();
    const senderIdStr = message.senderId.toString();

    // Gửi sự kiện socket cập nhật thu hồi tin nhắn
    const socketPayload = {
      messageId: updatedMessage._id,
      senderId: senderIdStr,
      receiverId: receiverIdStr,
      updatedMessage
    };

    socketService.emitToUser(receiverIdStr, "chat_message_recalled", socketPayload);
    socketService.emitToUser(senderIdStr, "chat_message_recalled", socketPayload);

    res.json({
      success: true,
      data: updatedMessage
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Bày tỏ / Đổi cảm xúc tin nhắn
 */
export const reactMessage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const { messageId } = req.params;
    const { type } = req.body; // "like" | "love" | "haha" | "wow" | "sad" | "angry"

    if (!userId) {
      throw new ServiceError("UNAUTHORIZED", "Không có quyền truy cập", 401);
    }
    if (!type || !["like", "love", "haha", "wow", "sad", "angry"].includes(type)) {
      throw new ServiceError("BAD_REQUEST", "Loại cảm xúc không hợp lệ", 400);
    }

    const message = await Message.findById(messageId);
    if (!message) {
      throw new ServiceError("NOT_FOUND", "Không tìm thấy tin nhắn", 404);
    }

    if (message.isRecalled) {
      throw new ServiceError("BAD_REQUEST", "Không thể bày tỏ cảm xúc trên tin nhắn đã thu hồi", 400);
    }

    const existingReactionIndex = message.reactions.findIndex(
      (r) => r.userId.toString() === userId
    );

    if (existingReactionIndex > -1) {
      // Toggle off nếu bấm lại cùng một cảm xúc
      if (message.reactions[existingReactionIndex].type === type) {
        message.reactions.splice(existingReactionIndex, 1);
      } else {
        // Cập nhật cảm xúc khác
        message.reactions[existingReactionIndex].type = type;
      }
    } else {
      // Thêm mới cảm xúc
      message.reactions.push({
        userId: new mongoose.Types.ObjectId(userId),
        type
      });
    }

    const updatedMessage = await message.save();

    const receiverIdStr = message.receiverId.toString();
    const senderIdStr = message.senderId.toString();

    // Gửi sự kiện socket cập nhật cảm xúc tin nhắn
    const socketPayload = {
      messageId: updatedMessage._id,
      reactions: updatedMessage.reactions,
      senderId: senderIdStr,
      receiverId: receiverIdStr
    };

    socketService.emitToUser(receiverIdStr, "chat_message_reacted", socketPayload);
    socketService.emitToUser(senderIdStr, "chat_message_reacted", socketPayload);

    res.json({
      success: true,
      data: updatedMessage
    });
  } catch (error) {
    next(error);
  }
};
