import { Router } from "express";
import { buyWithWallet, getMyMembership, giftMembership, adminGiftMembership } from "./userMemberships.controller";
import { auth, adminOnly } from "../../middlewares";

const router = Router();

// Tất cả route đều cần đăng nhập
router.use(auth);

router.get("/my", getMyMembership);
router.post("/buy-with-wallet", buyWithWallet);
router.post("/gift", giftMembership);
router.post("/admin-gift", adminOnly, adminGiftMembership);

export default router;
