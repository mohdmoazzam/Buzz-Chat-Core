import { Router } from "express";
import { isAuthenticated } from "../../common/middlewares/auth.js";
import { singleAvatar } from "../../common/middlewares/upload.js";
import { checkUsername, getProfile, updateProfile } from "./user.controller.js";

const router = Router();

router.get("/me", isAuthenticated, getProfile);
router.put("/me", isAuthenticated, singleAvatar, updateProfile);
router.get("/check-username", isAuthenticated, checkUsername);

export default router;
