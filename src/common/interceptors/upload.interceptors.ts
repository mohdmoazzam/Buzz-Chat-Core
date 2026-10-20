import { Injectable, mixin, type CallHandler, type ExecutionContext, type NestInterceptor, type Type } from "@nestjs/common";
import type { RequestHandler } from "express";
import multer from "multer";
import type { Observable } from "rxjs";
import { UPLOAD_MAX_BYTES, UPLOAD_MAX_FILES } from "../constants";

// Multer is run directly (instead of Nest's FileInterceptor) so its errors reach
// the exception filter untouched and get friendly messages.
const multerInterceptor = (handler: RequestHandler): Type<NestInterceptor> => {
    @Injectable()
    class MulterInterceptor implements NestInterceptor {
        async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
            const http = context.switchToHttp();
            await new Promise<void>((resolve, reject) =>
                handler(http.getRequest(), http.getResponse(), (error?: unknown) => (error ? reject(error) : resolve()))
            );
            return next.handle();
        }
    }
    return mixin(MulterInterceptor);
};

const filesUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: UPLOAD_MAX_BYTES, files: UPLOAD_MAX_FILES },
});

/** Up to UPLOAD_MAX_FILES files of any type in the "files" field (POST /assets only). */
export const FilesUpload = multerInterceptor(filesUpload.array("files", UPLOAD_MAX_FILES));
