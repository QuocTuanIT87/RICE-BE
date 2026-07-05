import { Request, Response, NextFunction } from "express";
import { Post } from "./post.model";
import { Comment } from "./comment.model";
import { Story } from "./story.model";
import { ServiceError } from "../../middlewares";
import { User } from "../auth/user.model";
import { UserMembership } from "../userMemberships/userMembership.model";
import { VipCosmetics } from "../vipCosmetics/vipCosmetics.model";
import { VipPackage } from "../vipPackages/vipPackage.model";
import { uploadToCloudinary, socketService } from "../../services";
import mongoose from "mongoose";

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
        .populate({
          path: "reactions.userId",
          select: "name avatar role vipCosmetics",
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Post.countDocuments(filter),
    ]);

    // Bổ sung trạng thái VIP tươi vào user object để tránh stale & tính số cmt & vip reactions
    const postsWithVip = await Promise.all(
      posts.map(async (post) => {
        const postObj = post.toObject();
        postObj.commentsCount = await Comment.countDocuments({ postId: post._id });
        if (postObj.userId) {
          postObj.userId = await fetchVipInfoForUser(postObj.userId);
        }
        if (postObj.reactions && postObj.reactions.length > 0) {
          postObj.reactions = await Promise.all(
            postObj.reactions.map(async (r: any) => {
              if (r.userId) {
                r.userId = await fetchVipInfoForUser(r.userId);
              }
              return r;
            })
          );
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
      })
      .populate({
        path: "reactions.userId",
        select: "name avatar role vipCosmetics",
      });

    if (!post) {
      throw new ServiceError("POST_NOT_FOUND", "Không tìm thấy bài viết này", 404);
    }

    const postObj = post.toObject();
    if (postObj.userId) {
      postObj.userId = await fetchVipInfoForUser(postObj.userId);
    }
    if (postObj.reactions && postObj.reactions.length > 0) {
      postObj.reactions = await Promise.all(
        postObj.reactions.map(async (r: any) => {
          if (r.userId) {
            r.userId = await fetchVipInfoForUser(r.userId);
          }
          return r;
        })
      );
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

    // Populate reactions.userId sau khi lưu
    const populatedPost = await Post.findById(postId).populate({
      path: "reactions.userId",
      select: "name avatar role vipCosmetics",
    });

    const rawReactions = populatedPost?.reactions || [];
    const populatedReactions = await Promise.all(
      rawReactions.map(async (r: any) => {
        const rObj = r.toObject ? r.toObject() : r;
        if (rObj.userId) {
          rObj.userId = await fetchVipInfoForUser(rObj.userId);
        }
        return rObj;
      })
    );

    // Realtime emit
    socketService.emitAll("forum_reaction_updated", {
      targetType: "post",
      targetId: postId,
      reactions: populatedReactions,
      likesCount: post.likes.length,
    });

    res.json({
      success: true,
      message,
      data: {
        reactions: populatedReactions,
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

/**
 * GET /api/forum/stories
 * Lấy danh sách stories chưa hết hạn
 */
export const getStories = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let activeStories = await Story.find({ expiresAt: { $gt: new Date() } })
      .populate("userId", "name avatar role")
      .sort({ createdAt: -1 });

    // Tự động seed story mẫu từ Mascot vào database nếu collection trống
    if (activeStories.length === 0) {
      console.log("🌱 Database stories trống. Tiến hành seed các tin mẫu từ Mascot...");
      const onePackage = await VipPackage.findOne();
      const defaultPkgId = onePackage?._id || new mongoose.Types.ObjectId();

      const mascotConfigs = [
        {
          name: "Cristiano Ronaldo (Mascot)",
          email: "ronaldo@webdatcom.local",
          theme: "emerald",
          avatar: "/ronaldo_left.png",
          imageUrl: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=600&auto=format&fit=crop",
          caption: "SIUUU! Cơm gà nướng mật ong trưa nay ngon nhức nách! Ăn xong muốn ra sân làm cú hat-trick ngay! 🍗⚽",
          musicTitle: "SIUUU Energetic (Ronaldo)",
          musicUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3"
        },
        {
          name: "Leo Messi (Mascot)",
          email: "messi@webdatcom.local",
          theme: "gold",
          avatar: "/messi_left.png",
          imageUrl: "https://images.unsplash.com/photo-1544025162-d76694265947?q=80&w=600&auto=format&fit=crop",
          caption: "Hôm nay được khao đĩa cơm sườn trứng ốp la ngon tuyệt. Xứng đáng vô địch thế giới! 🏆🥩",
          musicTitle: "Ankara Victory (Messi)",
          musicUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3"
        },
        {
          name: "Neymar Jr (Mascot)",
          email: "neymar@webdatcom.local",
          theme: "sakura",
          avatar: "/neymar_left.png",
          imageUrl: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?q=80&w=600&auto=format&fit=crop",
          caption: "Món ăn trưa rực rỡ sắc màu, chúc cả nhà văn phòng ngon miệng nha! 🌸🇧🇷",
          musicTitle: "Samba de Janeiro (Neymar)",
          musicUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3"
        }
      ];

      for (const config of mascotConfigs) {
        // 1. Tạo hoặc lấy User
        let mascotUser = await User.findOne({ email: config.email });
        if (!mascotUser) {
          mascotUser = new User({
            name: config.name,
            email: config.email,
            password: "mascot_password_placeholder",
            role: "user",
            isVerified: true,
          });
          await mascotUser.save();
        }

        // Cập nhật avatar nếu có thay đổi
        if (mascotUser.avatar !== config.avatar) {
          mascotUser.avatar = config.avatar;
          await mascotUser.save();
        }

        // 2. Tạo VipCosmetics cho user mascot
        let vipCosmetics = await VipCosmetics.findOne({ userId: mascotUser._id });
        if (!vipCosmetics) {
          vipCosmetics = new VipCosmetics({
            userId: mascotUser._id,
            vipTheme: config.theme,
            vipAvatarFrame: `${config.theme}-glow`,
            vipMascot: config.name.toLowerCase().split(" ")[0],
          });
          await vipCosmetics.save();
        }

        // 3. Tạo UserMembership để kích hoạt hasMembership = true
        const existingMembership = await UserMembership.findOne({ userId: mascotUser._id });
        if (!existingMembership) {
          const membership = new UserMembership({
            userId: mascotUser._id,
            vipPackageId: defaultPkgId,
            isActive: true,
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // Hạn dùng 1 năm
          });
          await membership.save();
        }

        // 4. Lưu story vào database collection stories
        const newStory = new Story({
          userId: mascotUser._id,
          imageUrl: config.imageUrl,
          caption: config.caption,
          musicTitle: config.musicTitle,
          musicUrl: config.musicUrl,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        });
        await newStory.save();
      }

      // Truy vấn lại danh sách sau khi seed
      activeStories = await Story.find({ expiresAt: { $gt: new Date() } })
        .populate("userId", "name avatar role")
        .sort({ createdAt: -1 });
    }

    // Populate VIP info for each story's owner
    const storiesWithVip = await Promise.all(
      activeStories.map(async (story) => {
        const storyObj = story.toObject();
        if (storyObj.userId) {
          storyObj.userId = await fetchVipInfoForUser(storyObj.userId);
        }
        return storyObj;
      })
    );

    res.json({
      success: true,
      data: storiesWithVip,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/forum/stories
 * Tạo story mới (tải lên hình ảnh và text ngắn)
 */
export const createStory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { caption, musicTitle, musicUrl } = req.body;
    const userId = req.user!.userId;

    if (!req.file) {
      throw new ServiceError("MISSING_FILE", "Vui lòng chọn hình ảnh để đăng tin", 400);
    }

    // Tải lên hình ảnh lên Cloudinary
    const imageUrl = await uploadToCloudinary(req.file.buffer, "rice-order/stories");

    const newStory = new Story({
      userId,
      imageUrl,
      caption: caption || "",
      musicTitle: musicTitle || "",
      musicUrl: musicUrl || "",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Hết hạn sau 24h
    });

    await newStory.save();

    // Populate user info for realtime socket emit
    const populatedStory = await Story.findById(newStory._id)
      .populate({
        path: "userId",
        select: "name avatar role",
        populate: { path: "vipCosmetics" },
      });

    if (populatedStory) {
      const storyObj = populatedStory.toObject();
      if (storyObj.userId) {
        storyObj.userId = await fetchVipInfoForUser(storyObj.userId);
      }
      socketService.emitAll("forum_story_created", storyObj);
    }

    res.status(201).json({
      success: true,
      message: "Đăng tin (Story) mới thành công!",
      data: newStory,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/forum/stories/:id
 * Xóa story của chính mình
 */
export const deleteStory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const storyId = req.params.id;
    const userId = req.user!.userId;

    const story = await Story.findById(storyId);
    if (!story) {
      throw new ServiceError("NOT_FOUND", "Không tìm thấy story yêu cầu", 404);
    }

    if (story.userId.toString() !== userId) {
      throw new ServiceError("UNAUTHORIZED", "Bạn không có quyền xóa story này", 403);
    }

    await Story.deleteOne({ _id: storyId });

    // Realtime emit
    socketService.emitAll("forum_story_deleted", { _id: storyId });

    res.json({
      success: true,
      message: "Đã xóa story thành công!",
    });
  } catch (error) {
    next(error);
  }
};
