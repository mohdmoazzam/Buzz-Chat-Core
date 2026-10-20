import { v2 as cloudinary } from "cloudinary";
import { v4 as uuid } from "uuid";
import { isCloudinaryConfigured } from "../../config/cloudinary.js";
import { ErrorHandler } from "../errors.js";

export interface UploadedFile {
    public_id: string;
    secureUrl: string;
}

const toDataUri = (file: Express.Multer.File) =>
    `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;

/**
 * Uploads files to Cloudinary. Throws a 5xx ErrorHandler on failure instead of
 * returning undefined, so callers never crash on a missing result.
 */
export const uploadFiles = async (files: Express.Multer.File[]): Promise<UploadedFile[]> => {
    if (!isCloudinaryConfigured()) {
        throw new ErrorHandler("File uploads are not configured on the server", 503);
    }
    try {
        const results = await Promise.all(
            files.map((file) => cloudinary.uploader.upload(toDataUri(file), { resource_type: "auto", public_id: uuid() }))
        );
        return results.map((res) => ({ public_id: res.public_id, secureUrl: res.secure_url }));
    } catch (error) {
        console.error("Cloudinary upload failed:", (error as Error)?.message ?? error);
        throw new ErrorHandler("Failed to upload file. Please try again.", 502);
    }
};

// Cloudinary deletes are per resource type; try each so videos/audio are removed too
export const deleteFiles = async (publicIds: Array<string | undefined>): Promise<void> => {
    const ids = publicIds.filter((id): id is string => Boolean(id));
    if (!ids.length || !isCloudinaryConfigured()) return;
    await Promise.all(
        (["image", "video", "raw"] as const).map((resource_type) =>
            cloudinary.api.delete_resources(ids, { resource_type }).catch((error: Error) =>
                console.error(`Cloudinary delete (${resource_type}) failed:`, error?.message ?? error)
            )
        )
    );
};
