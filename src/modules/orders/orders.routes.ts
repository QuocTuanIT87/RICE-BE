// Orders Routes
import { Router } from "express";
import * as ordersController from "./orders.controller";
import { auth, adminOnly } from "../../middlewares";

const router = Router();

// User routes
router.get("/my", auth, ordersController.getMyOrders);
router.get("/today", auth, ordersController.getMyTodayOrder);
router.post("/", auth, ordersController.createOrder);

// Admin routes
router.get("/by-date/:date", auth, adminOnly, ordersController.getOrdersByDate);
router.post("/confirm-all", auth, adminOnly, ordersController.confirmAllOrders);
router.get("/copy-text/:menuId", auth, adminOnly, ordersController.getCopyText);

export default router;
