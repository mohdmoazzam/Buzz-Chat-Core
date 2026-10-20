import type { Request } from "express";
import multer, { type FileFilterCallback } from "multer";
import { UPLOAD_MAX_BYTES, UPLOAD_MAX_FILES } from "../constants.js";
import { ErrorHandler } from "../errors.js";

const imagesOnly = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) =>
    file.mimetype?.startsWith("image/")
        ? cb(null, true)
        : cb(new ErrorHandler("Please upload an image file", 400));

const avatarUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: UPLOAD_MAX_BYTES, files: 1 },
    fileFilter: imagesOnly,
});

const attachmentUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: UPLOAD_MAX_BYTES, files: UPLOAD_MAX_FILES },
});

/** A single image in the "avatar" field (profile and group pictures). */
export const singleAvatar = avatarUpload.single("avatar");

/** Up to UPLOAD_MAX_FILES files of any type in the "files" field. */
export const attachments = attachmentUpload.array("files", UPLOAD_MAX_FILES);
