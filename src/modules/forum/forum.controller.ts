import { Request, Response, NextFunction } from "express";
import { Post } from "./post.model";
import { Comment } from "./comment.model";
import { ServiceError } from "../../middlewares";
import { User } from "../auth/user.model";
import { UserMembership } from "../userMemberships/userMembership.model";
import { VipCosmetics } from "../vipCosmetics/vipCosmetics.model";
import { uploadToCloudinary, socketService } from "../../services";

// Helper to fetch user membership status dynamically for list populates
const fetchVipInfoForUser = async (user: any) => {
  if (!user) return null;
  const membership = await UserMembership.findOne({
    userId: user._id,
    isActive: true,
    expiresAt: { $gt: new Date() },
  }).populate("vipPackageId");

  let vipCosmetics = user.vipCosmetics;
  if (!vipCosmetics) {
    vipCosmetics = await VipCosmetics.findOne({ userId: user._id });
  }

  return {
    _id: user._id,
    name: user.name,
    avatar: user.avatar,
    role: user.role,
    vipCosmetics: {
      vipTheme: vipCosmetics?.vipTheme || "default",
      vipAvatarFrame: vipCosmetics?.vipAvatarFrame || "none",
      vipCoverImage: vipCosmetics?.vipCoverImage || "",
      vipMascot: vipCosmetics?.vipMascot || "ronaldo",
      vipWebsiteName: vipCosmetics?.vipWebsiteName || "",
      vipWebsiteLogo: vipCosmetics?.vipWebsiteLogo || "",
      vipWebsiteBanner: vipCosmetics?.vipWebsiteBanner || "",
    },
    hasMembership: !!membership,
    membershipName: (membership?.vipPackageId as any)?.name || "",
    vipDiscountRate: (membership?.vipPackageId as any)?.discountAmount || 0,
  };
};

/**
 * GET /api/forum/posts
 * Lấy danh sách bài đăng (phân trang, lọc theo category)
 */
export const getPosts = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { category, search, page = 1, limit = 10 } = req.query;
    const filter: any = {};

    if (category) filter.category = category;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { content: { $regex: search, $options: "i" } },
      ];
    }

    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;

    const [posts, total] = await Promise.all([
      Post.find(filter)
        .populate({
          path: "userId",
          select: "name avatar role",
          populate: { path: "vipCosmetics" },
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Post.countDocuments(filter),
    ]);

    // Bổ sung trạng thái VIP tươi vào user object để tránh stale & tính số cmt
    const postsWithVip = await Promise.all(
      posts.map(async (post) => {
        const postObj = post.toObject();
        postObj.commentsCount = await Comment.countDocuments({ postId: post._id });
        if (postObj.userId) {
          postObj.userId = await fetchVipInfoForUser(postObj.userId);
        }
        return postObj;
      })
    );

    res.json({
      success: true,
      data: {
        docs: postsWithVip,
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/forum/posts/:id
 * Lấy chi tiết bài viết và tất cả bình luận đi kèm
 */
export const getPostById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const post = await Post.findById(req.params.id)
      .populate({
        path: "userId",
        select: "name avatar role",
        populate: { path: "vipCosmetics" },
      });

    if (!post) {
      throw new ServiceError("POST_NOT_FOUND", "Không tìm thấy bài viết này", 404);
    }

    const postObj = post.toObject();
    if (postObj.userId) {
      postObj.userId = await fetchVipInfoForUser(postObj.userId);
    }

    // Lấy tất cả comments
    const comments = await Comment.find({ postId: post._id })
      .populate({
        path: "userId",
        select: "name avatar role",
        populate: { path: "vipCosmetics" },
      })
      .sort({ createdAt: 1 });

    postObj.commentsCount = comments.length;

    const commentsWithVip = await Promise.all(
      comments.map(async (c) => {
        const cObj = c.toObject();
        if (cObj.userId) {
          cObj.userId = await fetchVipInfoForUser(cObj.userId);
        }
        return cObj;
      })
    );

    res.json({
      success: true,
      data: {
        post: postObj,
        comments: commentsWithVip,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/forum/posts
 * Đăng bài viết mới
 */
export const createPost = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { title, content, category } = req.body;
    const userId = req.user!.userId;

    if (!title || !content || !category) {
      throw new ServiceError("MISSING_FIELDS", "Vui lòng điền tiêu đề, nội dung và danh mục bài viết", 400);
    }

    let imageUrl = null;
    if (req.file) {
      imageUrl = await uploadToCloudinary(req.file.buffer, "rice-order/forum");
    }

    const newPost = new Post({
      title,
      content,
      category,
      userId,
      likes: [],
      imageUrl,
    });

    await newPost.save();

    // Populate user info for realtime socket emit
    const populatedPost = await Post.findById(newPost._id)
      .populate({
        path: "userId",
        select: "name avatar role",
        populate: { path: "vipCosmetics" },
      });
    
    if (populatedPost) {
      const postObj = populatedPost.toObject();
      if (postObj.userId) {
        postObj.userId = await fetchVipInfoForUser(postObj.userId);
      }
      postObj.commentsCount = 0;
      socketService.emitAll("forum_post_created", postObj);
    }

    res.status(201).json({
      success: true,
      message: "Đăng bài viết mới thành công!",
      data: newPost,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/forum/posts/:id/comment
 * Viết bình luận cho bài viết
 */
export const createComment = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { content, parentId } = req.body;
    const postId = req.params.id;
    const userId = req.user!.userId;

    if (!content) {
      throw new ServiceError("MISSING_CONTENT", "Nội dung bình luận là bắt buộc", 400);
    }

    const post = await Post.findById(postId);
    if (!post) {
      throw new ServiceError("POST_NOT_FOUND", "Không tìm thấy bài viết này", 404);
    }

    const newComment = new Comment({
      postId,
      userId,
      content,
      parentId: parentId || null,
    });

    await newComment.save();

    const populatedComment = await Comment.findById(newComment._id)
      .populate({
        path: "userId",
        select: "name avatar role",
        populate: { path: "vipCosmetics" },
      });

    const commentObj = populatedComment!.toObject();
    if (commentObj.userId) {
      commentObj.userId = await fetchVipInfoForUser(commentObj.userId);
    }

    // Realtime emit
    socketService.emitAll("forum_comment_created", {
      postId,
      comment: commentObj,
    });

    res.status(201).json({
      success: true,
      message: "Bình luận thành công!",
      data: commentObj,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/forum/posts/:id/like
 * Thích hoặc bỏ thích bài viết
 */
export const likePost = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const postId = req.params.id;
    const userId = req.user!.userId;

    const post = await Post.findById(postId);
    if (!post) {
      throw new ServiceError("POST_NOT_FOUND", "Không tìm thấy bài viết này", 404);
    }

    const likedIndex = post.likes.findIndex((id) => id.toString() === userId);
    let message = "";

    if (likedIndex >= 0) {
      // Đã thích -> Bỏ thích
      post.likes.splice(likedIndex, 1);
      message = "Đã bỏ thích bài viết";
      
      // Sync reactions
      if (post.reactions) {
        const reactIdx = post.reactions.findIndex((r) => r.userId.toString() === userId);
        if (reactIdx >= 0) post.reactions.splice(reactIdx, 1);
      }
    } else {
      // Chưa thích -> Bấm thích
      post.likes.push(userId as any);
      message = "Đã thích bài viết";
      
      // Sync reactions
      if (!post.reactions) post.reactions = [];
      const reactIdx = post.reactions.findIndex((r) => r.userId.toString() === userId);
      if (reactIdx >= 0) {
        post.reactions[reactIdx].type = "like";
      } else {
        post.reactions.push({ userId, type: "like" });
      }
    }

    await post.save();

    // Realtime emit
    socketService.emitAll("forum_reaction_updated", {
      targetType: "post",
      targetId: postId,
      reactions: post.reactions || [],
      likesCount: post.likes.length,
    });

    res.json({
      success: true,
      message,
      data: {
        likesCount: post.likes.length,
        isLiked: likedIndex < 0,
        reactions: post.reactions || [],
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/forum/posts/:id/react
 * Thả cảm xúc bài viết (like, love, haha, wow, sad, angry)
 */
export const reactPost = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const postId = req.params.id;
    const { type } = req.body;
    const userId = req.user!.userId;

    if (!type || !["like", "love", "haha", "wow", "sad", "angry"].includes(type)) {
      throw new ServiceError("INVALID_REACTION", "Loại cảm xúc không hợp lệ", 400);
    }

    const post = await Post.findById(postId);
    if (!post) {
      throw new ServiceError("POST_NOT_FOUND", "Không tìm thấy bài viết này", 404);
    }

    if (!post.reactions) {
      post.reactions = [];
    }

    const existingIndex = post.reactions.findIndex((r) => r.userId.toString() === userId);
    let message = "";

    if (existingIndex >= 0) {
      if (post.reactions[existingIndex].type === type) {
        // Toggle off if clicking the same reaction
        post.reactions.splice(existingIndex, 1);
        message = "Đã bỏ cảm xúc";
      } else {
        // Change reaction type
        post.reactions[existingIndex].type = type as any;
        message = `Đã đổi cảm xúc thành ${type}`;
      }
    } else {
      // Add reaction
      post.reactions.push({ userId, type: type as any });
      message = `Đã bày tỏ cảm xúc ${type}`;
    }

    // Sync with likes array for backwards compatibility
    post.likes = post.reactions.map((r) => r.userId.toString());

    await post.save();

    // Realtime emit
    socketService.emitAll("forum_reaction_updated", {
      targetType: "post",
      targetId: postId,
      reactions: post.reactions || [],
      likesCount: post.likes.length,
    });

    res.json({
      success: true,
      message,
      data: {
        reactions: post.reactions,
        likesCount: post.likes.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/forum/comments/:id/react
 * Thả cảm xúc bình luận (like, love, haha, wow, sad, angry)
 */
export const reactComment = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const commentId = req.params.id;
    const { type } = req.body;
    const userId = req.user!.userId;

    if (!type || !["like", "love", "haha", "wow", "sad", "angry"].includes(type)) {
      throw new ServiceError("INVALID_REACTION", "Loại cảm xúc không hợp lệ", 400);
    }

    const comment = await Comment.findById(commentId);
    if (!comment) {
      throw new ServiceError("COMMENT_NOT_FOUND", "Không tìm thấy bình luận này", 404);
    }

    if (!comment.reactions) {
      comment.reactions = [];
    }

    const existingIndex = comment.reactions.findIndex((r) => r.userId.toString() === userId);
    let message = "";

    if (existingIndex >= 0) {
      if (comment.reactions[existingIndex].type === type) {
        // Toggle off
        comment.reactions.splice(existingIndex, 1);
        message = "Đã bỏ cảm xúc";
      } else {
        // Change type
        comment.reactions[existingIndex].type = type as any;
        message = `Đã đổi cảm xúc thành ${type}`;
      }
    } else {
      // Add reaction
      comment.reactions.push({ userId, type: type as any });
      message = `Đã bày tỏ cảm xúc ${type}`;
    }

    await comment.save();

    // Realtime emit
    socketService.emitAll("forum_reaction_updated", {
      targetType: "comment",
      targetId: commentId,
      postId: comment.postId.toString(),
      reactions: comment.reactions || [],
    });

    res.json({
      success: true,
      message,
      data: {
        reactions: comment.reactions,
      },
    });
  } catch (error) {
    next(error);
  }
};
