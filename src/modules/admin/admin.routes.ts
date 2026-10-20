import { Router } from "express";
import { adminOnly } from "../../common/middlewares/auth.js";
import { adminLimiter } from "../../common/middlewares/rateLimit.js";
import {
    adminLogin, adminLogout, getAdminData, getAllChats, getAllMessages, getAllUsers, getDashboardStats,
} from "./admin.controller.js";

const router = Router();

router.post("/verify", adminLimiter, adminLogin);
router.get("/logout", adminLogout);

router.use(adminOnly);

router.get("/", getAdminData);
router.get("/users", getAllUsers);
router.get("/chats", getAllChats);
router.get("/messages", getAllMessages);
router.get("/stats", getDashboardStats);

export default router;
