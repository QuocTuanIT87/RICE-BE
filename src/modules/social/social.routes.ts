import { Router } from "express";
import {
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  unfriend,
  getFriendRequests,
  getFriendsList,
  followUser,
  unfollowUser,
  getPublicProfile,
  getFollowersList,
  getFollowingList,
} from "./social.controller";
import { auth } from "../../middlewares";

const router = Router();

// Routes cho bạn bè
router.post("/friends/request/:userId", auth, sendFriendRequest);
router.post("/friends/accept/:userId", auth, acceptFriendRequest);
router.post("/friends/decline/:userId", auth, declineFriendRequest);
router.delete("/friends/unfriend/:userId", auth, unfriend);
router.get("/friends/requests", auth, getFriendRequests);
router.get("/friends/list", auth, getFriendsList);

// Routes cho theo dõi
router.post("/follow/:userId", auth, followUser);
router.delete("/unfollow/:userId", auth, unfollowUser);
router.get("/followers", auth, getFollowersList);
router.get("/following", auth, getFollowingList);

// Trang cá nhân công khai
router.get("/profile/:userId", auth, getPublicProfile);

export default router;
