// DailyMenus Routes
import { Router } from "express";
import * as dailyMenusController from "./dailyMenus.controller";
import { auth, adminOnly } from "../../middlewares";

const router = Router();

// Public routes
router.get("/", dailyMenusController.getDailyMenus);
router.get("/today", dailyMenusController.getTodayMenu);
router.get("/:id", dailyMenusController.getDailyMenuById);

// Admin routes
router.post("/preview", auth, adminOnly, dailyMenusController.previewMenu);
router.post("/", auth, adminOnly, dailyMenusController.createDailyMenu);
router.put("/:id", auth, adminOnly, dailyMenusController.updateDailyMenu);
router.patch("/:id/lock", auth, adminOnly, dailyMenusController.lockMenu);
router.patch("/:id/unlock", auth, adminOnly, dailyMenusController.unlockMenu);

export default router;
