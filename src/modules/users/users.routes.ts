// Users Routes
import { Router } from "express";
import * as usersController from "./users.controller";
import { auth, adminOnly } from "../../middlewares";

const router = Router();

// Route public (chỉ cần đăng nhập)
router.get("/leaderboard", auth, usersController.getLeaderboard);
router.get("/leaderboard/coins", auth, usersController.getTopCoins);
router.get("/leaderboard/orders", auth, usersController.getTopOrders);

// Tất cả routes bên dưới đều cần admin
router.use(auth, adminOnly);

router.get("/", usersController.getUsers);
router.get("/:id", usersController.getUserById);
router.patch("/:id/block", usersController.blockUser);
router.patch("/:id/unblock", usersController.unblockUser);
router.patch("/:id/reset-password", usersController.resetUserPassword);

export default router;