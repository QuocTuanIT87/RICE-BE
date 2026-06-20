import { Router } from "express";
import {
  getConversations,
  getMessages,
  sendMessage,
  recallMessage,
  reactMessage,
} from "./chat.controller";
import { auth, upload } from "../../middlewares";

const router = Router();

// Tất cả các route chat đều yêu cầu xác thực người dùng
router.get("/conversations", auth, getConversations);
router.get("/messages/:partnerId", auth, getMessages);
router.post("/messages", auth, upload.single("image"), sendMessage);
router.put("/messages/:messageId/recall", auth, recallMessage);
router.post("/messages/:messageId/react", auth, reactMessage);

export default router;
