// Auth Routes - Định tuyến cho module xác thực
import { Router } from "express";
import * as authController from "./auth.controller";
import { auth } from "../../middlewares";

const router = Router();

// Public routes (không cần đăng nhập)
router.post("/register", authController.register);
router.post("/verify-otp", authController.verifyOTP);
router.post("/resend-otp", authController.resendOTP);
router.post("/login", authController.login);

// Protected routes (cần đăng nhập)
router.get("/me", auth, authController.getMe);
<<<<<<< HEAD
=======
router.patch("/profile", auth, authController.updateProfile);
router.patch("/change-password", auth, authController.changePassword);
>>>>>>> 88316e3796a554084c42223fe02bd664f932e5f9

export default router;
