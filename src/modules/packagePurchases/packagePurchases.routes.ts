// PackagePurchases Routes
import { Router } from "express";
import * as packagePurchasesController from "./packagePurchases.controller";
import { auth, adminOnly } from "../../middlewares";

const router = Router();

// User routes
router.get("/my", auth, packagePurchasesController.getMyPurchaseRequests);
router.post("/", auth, packagePurchasesController.createPurchaseRequest);

// Admin routes
router.get(
  "/",
  auth,
  adminOnly,
  packagePurchasesController.getPurchaseRequests,
);
router.post(
  "/:id/approve",
  auth,
  adminOnly,
  packagePurchasesController.approvePurchaseRequest,
);
router.post(
  "/:id/reject",
  auth,
  adminOnly,
  packagePurchasesController.rejectPurchaseRequest,
);

export default router;
