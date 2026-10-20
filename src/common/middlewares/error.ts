import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { config } from "../../config/env.js";
import { UPLOAD_MAX_BYTES, UPLOAD_MAX_FILES } from "../constants.js";

const MULTER_MESSAGES: Partial<Record<multer.ErrorCode, string>> = {
    LIMIT_FILE_SIZE: `Each file must be under ${UPLOAD_MAX_BYTES / (1024 * 1024)} MB`,
    LIMIT_FILE_COUNT: `You can upload up to ${UPLOAD_MAX_FILES} files at a time`,
    LIMIT_UNEXPECTED_FILE: "Unexpected file field",
};

interface AppError extends Error {
    statusCode?: number;
    status?: number;
    expose?: boolean;
    code?: number | string;
    type?: string;
    errors?: Record<string, { message: string }>;
}

// Turns any thrown error into a consistent { success, message } response.
// Internal details are logged, never leaked to the client.
export const errorMiddleware = (err: AppError, req: Request, res: Response, _next: NextFunction) => {
    let status = err.statusCode ?? err.status ?? 500;
    let message = err.expose ? err.message : "Something went wrong. Please try again.";

    if (err instanceof multer.MulterError) {
        status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
        message = MULTER_MESSAGES[err.code] ?? "Invalid upload";
    } else if (err.name === "CastError") {
        status = 400;
        message = "Invalid id";
    } else if (err.name === "ValidationError") {
        status = 400;
        message = Object.values(err.errors ?? {}).map((e) => e.message).join(". ") || "Invalid data";
    } else if (err.code === 11000) {
        status = 409;
        message = "This already exists";
    } else if (err.type === "entity.too.large") {
        status = 413;
        message = "Request is too large";
    } else if (err.type === "entity.parse.failed") {
        status = 400;
        message = "Invalid JSON body";
    }

    if (status >= 500) {
        console.error(`[${req.method} ${req.originalUrl}]`, err);
    }

    return res.status(status).json({
        success: false,
        message,
        ...(config.isProduction || status < 500 ? {} : { stack: err.stack }),
    });
};

export const notFoundHandler = (req: Request, res: Response) =>
    res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
