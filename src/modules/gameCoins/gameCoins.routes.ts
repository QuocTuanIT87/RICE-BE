// GameCoins Routes
import { Router } from "express";
import * as gameCoinsController from "./gameCoins.controller";
import { auth } from "../../middlewares";

const router = Router();

// Tất cả routes đều cần đăng nhập
router.get("/balance", auth, gameCoinsController.getBalance);
router.post("/update", auth, gameCoinsController.updateCoins);
router.post("/exchange", auth, gameCoinsController.exchangeCoins);

export default router;
