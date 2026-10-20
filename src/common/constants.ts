import type { CookieOptions } from "express";
import { config } from "../config/env";

// Cross-cutting constants. Feature-specific limits live in each module.

export const AUTH_COOKIE = "buzzChat-token";
export const ADMIN_COOKIE = "buzzChat-admin-token";

export const cookieOptions: CookieOptions = {
    maxAge: config.tokenTtlSeconds * 1000,
    sameSite: "none",
    httpOnly: true,
    secure: true,
};

export const UPLOAD_MAX_FILES = 5;
export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

export const TRY_LATER = "Too many attempts. Please wait a few minutes and try again.";
