import { Catch, HttpException, HttpStatus, Logger, NotFoundException, type ArgumentsHost, type ExceptionFilter } from "@nestjs/common";
import type { Request, Response } from "express";
import multer from "multer";
import { config } from "../../config/env";
import { Prisma } from "../../../prisma/generated/client";
import { GENERIC_ERROR_MESSAGE, UPLOAD_MAX_BYTES, UPLOAD_MAX_FILES } from "../constants";

const MULTER_MESSAGES: Partial<Record<multer.ErrorCode, string>> = {
    LIMIT_FILE_SIZE: `Each file must be under ${UPLOAD_MAX_BYTES / (1024 * 1024)} MB`,
    LIMIT_FILE_COUNT: `You can upload up to ${UPLOAD_MAX_FILES} files at a time`,
    LIMIT_UNEXPECTED_FILE: "Unexpected file field",
};

const httpMessage = (exception: HttpException): string => {
    const body = exception.getResponse();
    if (typeof body === "string") return body;
    const message = (body as { message?: unknown }).message;
    if (Array.isArray(message)) return message.join(". ");
    return typeof message === "string" ? message : exception.message;
};

const describe = (exception: unknown, req: Request): { status: number; message: string } => {
    if (exception instanceof multer.MulterError) {
        return {
            status: exception.code === "LIMIT_FILE_SIZE" ? HttpStatus.PAYLOAD_TOO_LARGE : HttpStatus.BAD_REQUEST,
            message: MULTER_MESSAGES[exception.code] ?? "Invalid upload",
        };
    }
    if (exception instanceof HttpException) {
        const status = exception.getStatus();
        const message = httpMessage(exception);
        // Nest's router reports unknown routes as "Cannot GET /path"
        if (exception instanceof NotFoundException && message.startsWith(`Cannot ${req.method} `)) {
            return { status, message: `Route not found: ${req.method} ${req.originalUrl}` };
        }
        return { status, message: status >= 500 && status !== 502 && status !== 503 ? GENERIC_ERROR_MESSAGE : message };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
        if (exception.code === "P2002") return { status: HttpStatus.CONFLICT, message: "This already exists" };
        if (exception.code === "P2025") return { status: HttpStatus.NOT_FOUND, message: "Not found" };
    }
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: GENERIC_ERROR_MESSAGE };
};

/**
 * Turns any thrown error into a consistent { success, message } response.
 * Internal details are logged, never leaked to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    private readonly logger = new Logger("HTTP");

    catch(exception: unknown, host: ArgumentsHost): void {
        const http = host.switchToHttp();
        const req = http.getRequest<Request>();
        const res = http.getResponse<Response>();
        const { status, message } = describe(exception, req);

        if (status >= 500) {
            this.logger.error(`[${req.method} ${req.originalUrl}]`, (exception as Error)?.stack ?? exception);
        }

        res.status(status).json({
            success: false,
            message,
            ...(config.isProduction || status < 500 ? {} : { stack: (exception as Error)?.stack }),
        });
    }
}
