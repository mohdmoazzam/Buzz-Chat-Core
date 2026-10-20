import type { Request } from "express";

export class ErrorHandler extends Error {
    statusCode: number;
    // Marks errors whose message is safe to show to the client
    expose = true;

    constructor(message: string, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
    }
}

/** The authenticated user's id; only call on routes behind isAuthenticated. */
export const currentUserId = (req: Request): string => {
    if (!req.user) throw new ErrorHandler("Please log in to continue", 401);
    return req.user;
};

export const isDuplicateKeyError = (error: unknown): boolean => (error as { code?: number })?.code === 11000;
