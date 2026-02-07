// MealPackages Routes
import { Router } from "express";
import * as mealPackagesController from "./mealPackages.controller";
import { auth, adminOnly } from "../../middlewares";

const router = Router();

// Public routes
router.get("/", mealPackagesController.getMealPackages);
router.get("/:id", mealPackagesController.getMealPackageById);

// Admin only routes
router.post("/", auth, adminOnly, mealPackagesController.createMealPackage);
router.put("/:id", auth, adminOnly, mealPackagesController.updateMealPackage);
router.delete(
  "/:id",
  auth,
  adminOnly,
  mealPackagesController.deleteMealPackage,
);

export default router;
