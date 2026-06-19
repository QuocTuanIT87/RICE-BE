import { Router } from "express";
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  createNotification,
  getAdminNotifications,
} from "./notifications.controller";
import { auth, adminOnly } from "../../middlewares";

const router = Router();

// Endpoint của user (cần đăng nhập)
router.get("/", auth, getNotifications);
router.patch("/read-all", auth, markAllAsRead);
router.patch("/:id/read", auth, markAsRead);

// Endpoint của admin (cần quyền admin)
router.get("/admin", auth, adminOnly, getAdminNotifications);
router.post("/", auth, adminOnly, createNotification);

export default router;
