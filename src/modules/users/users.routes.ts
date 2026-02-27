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
<<<<<<< HEAD
=======
router.patch("/:id/reset-password", usersController.resetUserPassword);
>>>>>>> 88316e3796a554084c42223fe02bd664f932e5f9

export default router;
