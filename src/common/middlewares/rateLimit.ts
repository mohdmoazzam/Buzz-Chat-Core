import rateLimit from "express-rate-limit";

const limiter = (windowMinutes: number, limit: number, message: string) =>
    rateLimit({
        windowMs: windowMinutes * 60 * 1000,
        limit,
        standardHeaders: "draft-7",
        legacyHeaders: false,
        handler: (_req, res) => res.status(429).json({ success: false, message }),
    });

const TRY_LATER = "Too many attempts. Please wait a few minutes and try again.";

// Brute-force protection for credentials
export const authLimiter = limiter(15, 20, TRY_LATER);

// Admin secret guessing
export const adminLimiter = limiter(15, 10, TRY_LATER);

// Signup spam
export const registerLimiter = limiter(60, 10, "Too many accounts created. Please try again later.");

// General API ceiling per IP
export const apiLimiter = limiter(1, 300, "You're doing that too often. Please slow down.");
