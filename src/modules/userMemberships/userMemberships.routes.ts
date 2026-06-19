import { Router } from "express";
import { buyWithWallet, getMyMembership, giftMembership } from "./userMemberships.controller";
import { auth } from "../../middlewares";

const router = Router();

// Tất cả route đều cần đăng nhập
router.use(auth);

router.get("/my", getMyMembership);
router.post("/buy-with-wallet", buyWithWallet);
router.post("/gift", giftMembership);

export default router;
