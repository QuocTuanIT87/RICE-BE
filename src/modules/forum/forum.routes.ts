import { Router } from "express";
import {
  getPosts,
  getPostById,
  createPost,
  createComment,
  likePost,
  reactPost,
  reactComment,
} from "./forum.controller";
import { auth, upload } from "../../middlewares";

const router = Router();

// Lấy danh sách & chi tiết bài viết (Công khai)
router.get("/posts", getPosts);
router.get("/posts/:id", getPostById);

// Đăng bài, bình luận, like, react (Cần đăng nhập)
router.post("/posts", auth, upload.single("image"), createPost);
router.post("/posts/:id/comment", auth, createComment);
router.post("/posts/:id/like", auth, likePost);
router.post("/posts/:id/react", auth, reactPost);
router.post("/comments/:id/react", auth, reactComment);

export default router;
