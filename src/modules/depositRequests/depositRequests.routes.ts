import { Router } from "express";
import * as depositRequestsController from "./depositRequests.controller";
import { auth, adminOnly } from "../../middlewares";

const router = Router();

// Routes cho User đã đăng nhập
router.post("/", auth, depositRequestsController.createDepositRequest);
router.get("/my", auth, depositRequestsController.getMyDepositRequests);

// Routes cho Admin
router.get("/", auth, adminOnly, depositRequestsController.getDepositRequests);
router.post("/:id/approve", auth, adminOnly, depositRequestsController.approveDepositRequest);
router.post("/:id/reject", auth, adminOnly, depositRequestsController.rejectDepositRequest);

export default router;
