// Statistics Routes
import { Router } from "express";
import * as statisticsController from "./statistics.controller";
import { auth, adminOnly } from "../../middlewares";

const router = Router();

// Tất cả routes đều cần admin
router.use(auth, adminOnly);

router.get("/revenue", statisticsController.getRevenue);
router.get("/menu-items", statisticsController.getMenuItemStats);
router.get("/dashboard", statisticsController.getDashboard);

export default router;
