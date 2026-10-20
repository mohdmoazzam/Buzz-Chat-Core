import type { NextFunction, Request, Response } from "express";
import { User } from "../../modules/user/user.model.js";
import { ADMIN_COOKIE, AUTH_COOKIE } from "../constants.js";
import { ErrorHandler } from "../errors.js";
import { parseBearer, verifyToken } from "../utils/token.js";
import { asyncHandler } from "./asyncHandler.js";

export const isAuthenticated = asyncHandler(async (req, _res, next) => {
    const token = parseBearer(req.header("Authorization")) || parseBearer(req.cookies?.[AUTH_COOKIE]);
    const decoded = token ? verifyToken(token) : null;
    const userId = typeof decoded?._id === "string" ? decoded._id : null;

    // Reject tokens for accounts that no longer exist
    if (!userId || !(await User.exists({ _id: userId }))) {
        return next(new ErrorHandler("Please log in to continue", 401));
    }
    req.user = userId;
    next();
});

export const adminOnly = (req: Request, _res: Response, next: NextFunction) => {
    const token = parseBearer(req.header("Authorization")) || parseBearer(req.cookies?.[ADMIN_COOKIE]);
    const decoded = token ? verifyToken(token) : null;
    if (decoded?.role !== "admin") {
        return next(new ErrorHandler("Only admins can access this route", 401));
    }
    next();
};
