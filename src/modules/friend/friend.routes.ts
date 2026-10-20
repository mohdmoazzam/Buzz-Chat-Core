import { Router } from "express";
import { isAuthenticated } from "../../common/middlewares/auth.js";
import { getFriends, getNotifications, respondToRequest, searchUsers, sendRequest } from "./friend.controller.js";

// Mounted under /api/v1/user to keep the existing client URLs
const router = Router();

router.get("/search", isAuthenticated, searchUsers);
router.post("/sendRequest", isAuthenticated, sendRequest);
router.put("/acceptRequest", isAuthenticated, respondToRequest);
router.get("/myNotifications", isAuthenticated, getNotifications);
router.get("/myFriends", isAuthenticated, getFriends);

export default router;
