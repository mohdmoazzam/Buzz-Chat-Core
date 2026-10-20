import { createHash, timingSafeEqual } from "crypto";
import type { Request } from "express";
import { DEV_MASTER_PASSWORD_MIN_LENGTH } from "../../common/constants";

// DEV ONLY: a master password that logs in as any user.
// Active only when ALL of these hold:
//   1. NODE_ENV === "development"
//   2. DEV_MASTER_PASSWORD is set (min 12 chars)
//   3. the request comes from the local machine (loopback address)
// Never set DEV_MASTER_PASSWORD on a deployed server.

export const isDevMasterPasswordEnabled = (): boolean =>
    process.env.NODE_ENV === "development" &&
    typeof process.env.DEV_MASTER_PASSWORD === "string" &&
    process.env.DEV_MASTER_PASSWORD.length >= DEV_MASTER_PASSWORD_MIN_LENGTH;

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

// Uses the raw socket address, not X-Forwarded-For, so proxies can't spoof it
const isLocalRequest = (req: Request): boolean => LOOPBACK.has(req.socket?.remoteAddress ?? "");

const sha256 = (value: string) => createHash("sha256").update(value).digest();

export const isDevMasterLogin = (req: Request, password: unknown): boolean => {
    if (!isDevMasterPasswordEnabled() || !isLocalRequest(req) || typeof password !== "string" || !password) {
        return false;
    }
    return timingSafeEqual(sha256(password), sha256(process.env.DEV_MASTER_PASSWORD as string));
};
