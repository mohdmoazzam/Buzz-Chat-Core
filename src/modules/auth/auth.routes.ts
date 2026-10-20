import { Router } from "express";
import { authLimiter, registerLimiter } from "../../common/middlewares/rateLimit.js";
import { singleAvatar } from "../../common/middlewares/upload.js";
import { validate } from "../../common/middlewares/validate.js";
import { login, logout, register } from "./auth.controller.js";
import { loginRules, registerRules } from "./auth.validators.js";

// Mounted under /api/v1/user to keep the existing client URLs
const router = Router();

router.post("/register", registerLimiter, singleAvatar, registerRules, validate, register);
router.post("/login", authLimiter, loginRules, validate, login);
// Logout must work even with an expired session
router.get("/logout", logout);

export default router;
