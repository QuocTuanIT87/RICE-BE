import { Router } from "express";
import * as vipLevelsController from "./vipLevels.controller";
import { auth, adminOnly } from "../../middlewares";

const router = Router();

// Route public (yêu cầu đã đăng nhập)
router.get("/", auth, vipLevelsController.getVipLevels);

// Các routes admin
router.post("/", auth, adminOnly, vipLevelsController.createVipLevel);
router.put("/:id", auth, adminOnly, vipLevelsController.updateVipLevel);
router.delete("/:id", auth, adminOnly, vipLevelsController.deleteVipLevel);

export default router;
