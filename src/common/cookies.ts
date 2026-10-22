import type { CookieOptions, Response } from "express";
import { config } from "../config/env";
import { ADMIN_COOKIE, AUTH_COOKIE } from "./constants";

// The frontend is on another site, so cookies must be SameSite=None (which requires Secure)
const COOKIE_OPTIONS: CookieOptions = { sameSite: "none", httpOnly: true, secure: true };

/** Stores the user's session token in the session cookie (sent alongside the token in the body). */
export const setAuthCookie = (res: Response, token: string): void => {
    res.cookie(AUTH_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: config.tokenTtlSeconds * 1000 });
};

export const clearAuthCookie = (res: Response): void => {
    res.cookie(AUTH_COOKIE, "", { ...COOKIE_OPTIONS, maxAge: 0 });
};

export const setAdminCookie = (res: Response, token: string): void => {
    res.cookie(ADMIN_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: config.adminTokenTtlSeconds * 1000 });
};

export const clearAdminCookie = (res: Response): void => {
    res.cookie(ADMIN_COOKIE, "", { ...COOKIE_OPTIONS, maxAge: 0 });
};
