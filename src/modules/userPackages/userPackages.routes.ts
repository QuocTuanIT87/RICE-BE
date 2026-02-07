// UserPackages Routes
import { Router } from "express";
import * as userPackagesController from "./userPackages.controller";
import { auth } from "../../middlewares";

const router = Router();

router.get("/my", auth, userPackagesController.getMyPackages);
router.get("/my/active", auth, userPackagesController.getMyActivePackages);
router.post("/:id/set-active", auth, userPackagesController.setActivePackage);

export default router;
