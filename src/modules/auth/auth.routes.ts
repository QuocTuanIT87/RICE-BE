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
router.patch("/profile", auth, authController.updateProfile);
router.patch("/change-password", auth, authController.changePassword);

export default router;
