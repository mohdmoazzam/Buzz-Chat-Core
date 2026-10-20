import type { Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { config } from "../../config/env.js";
import { AUTH_COOKIE, cookieOptions } from "../constants.js";
import type { Id } from "./ids.js";

export const signUserToken = (userId: Id): string =>
    jwt.sign({ _id: String(userId) }, config.jwtSecret, { expiresIn: config.tokenTtlSeconds });

export const signAdminToken = (): string =>
    jwt.sign({ role: "admin" }, config.jwtSecret, { expiresIn: config.adminTokenTtlSeconds });

export const verifyToken = (token: string): JwtPayload | null => {
    try {
        const decoded = jwt.verify(token, config.jwtSecret);
        return typeof decoded === "object" ? decoded : null;
    } catch {
        return null;
    }
};

/** Strips an optional "Bearer " prefix and rejects empty/"null" values. */
export const parseBearer = (value: unknown): string | null => {
    if (!value || typeof value !== "string") return null;
    const token = value.replace(/^Bearer\s+/i, "").trim();
    return token && token !== "null" && token !== "undefined" ? token : null;
};

/** Issues a session token (cookie + body) and sends the user. */
export const sendAuthResponse = (res: Response, user: { _id: Id }, code: number, message: string) => {
    const token = signUserToken(user._id);
    return res.status(code).cookie(AUTH_COOKIE, token, cookieOptions).json({
        success: true,
        message,
        access_token: token,
        user,
    });
};
