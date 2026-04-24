import { Router } from "express";
import * as systemController from "./system.controller";
import { auth, adminOnly } from "../../middlewares";

const router = Router();

// Public: Lấy cấu hình website
router.get("/config", systemController.getSystemConfig);

// Admin: Cập nhật cấu hình
router.put(
  "/config",
  auth,
  adminOnly,
  systemController.updateSystemConfig
);

export default router;
