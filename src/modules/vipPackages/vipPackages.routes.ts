import { Router } from "express";
import {
  getActiveVipPackages,
  getAdminVipPackages,
  createVipPackage,
  updateVipPackage,
  deleteVipPackage,
} from "./vipPackages.controller";
import { auth, adminOnly } from "../../middlewares";

const router = Router();

// Routes cho User và Public
router.get("/", getActiveVipPackages);

// Routes cho Admin
router.get("/admin", auth, adminOnly, getAdminVipPackages);
router.post("/", auth, adminOnly, createVipPackage);
router.put("/:id", auth, adminOnly, updateVipPackage);
router.delete("/:id", auth, adminOnly, deleteVipPackage);

export default router;
