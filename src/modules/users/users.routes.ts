// Users Routes
import { Router } from "express";
import * as usersController from "./users.controller";
import { auth, adminOnly } from "../../middlewares";

const router = Router();

// Tất cả routes đều cần admin
router.use(auth, adminOnly);

router.get("/", usersController.getUsers);
router.get("/:id", usersController.getUserById);
router.patch("/:id/block", usersController.blockUser);
router.patch("/:id/unblock", usersController.unblockUser);
router.patch("/:id/reset-password", usersController.resetUserPassword);

export default router;