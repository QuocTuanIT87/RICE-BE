// Vouchers Routes
import { Router } from "express";
import * as vouchersController from "./vouchers.controller";
import { auth, adminOnly } from "../../middlewares";

const router = Router();

// User routes
router.post("/check", auth, vouchersController.checkVoucher);
router.get("/my", auth, vouchersController.getMyVouchers);

// Admin routes
router.get("/", auth, adminOnly, vouchersController.getVouchers);
router.post("/", auth, adminOnly, vouchersController.createVoucher);
router.put("/:id", auth, adminOnly, vouchersController.updateVoucher);
router.delete("/:id", auth, adminOnly, vouchersController.deleteVoucher);

export default router;
