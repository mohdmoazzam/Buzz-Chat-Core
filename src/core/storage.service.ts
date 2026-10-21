import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { v2 as cloudinary } from "cloudinary";
import { randomUUID } from "crypto";
import { config } from "../config/env";
/** A file as stored on Cloudinary. */
export interface StoredFile {
    public_id: string;
    url: string;
    /** image, video or raw */
    resource_type: string;
}

const toDataUri = (file: Express.Multer.File) => `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;

/** Cloudinary file storage, used by AssetsService. */
@Injectable()
export class StorageService {
    private readonly logger = new Logger(StorageService.name);

    readonly isConfigured = Boolean(config.cloudinary.cloudName && config.cloudinary.apiKey && config.cloudinary.apiSecret);

    constructor() {
        cloudinary.config({
            cloud_name: config.cloudinary.cloudName,
            api_key: config.cloudinary.apiKey,
            api_secret: config.cloudinary.apiSecret,
            secure: true,
        });
    }

    /** Throws a 5xx instead of returning undefined, so callers never crash on a missing result. */
    async upload(files: Express.Multer.File[]): Promise<StoredFile[]> {
        if (!this.isConfigured) {
            throw new HttpException("File uploads are not configured on the server", HttpStatus.SERVICE_UNAVAILABLE);
        }
        try {
            const results = await Promise.all(
                files.map((file) => cloudinary.uploader.upload(toDataUri(file), { resource_type: "auto", public_id: randomUUID() })),
            );
            return results.map((res) => ({ public_id: res.public_id, url: res.secure_url, resource_type: res.resource_type }));
        } catch (error) {
            this.logger.error(`Cloudinary upload failed: ${(error as Error)?.message ?? error}`);
            throw new HttpException("Failed to upload file. Please try again.", HttpStatus.BAD_GATEWAY);
        }
    }

    /**
     * Deletes files without making the caller wait (cleanup can be slow).
     * Cloudinary deletes are per resource type; try each so videos/audio are removed too.
     */
    removeInBackground(publicIds: Array<string | null | undefined>): void {
        const ids = publicIds.filter((id): id is string => Boolean(id));
        if (!ids.length || !this.isConfigured) return;
        for (const resource_type of ["image", "video", "raw"] as const) {
            cloudinary.api
                .delete_resources(ids, { resource_type })
                .catch((error: Error) => this.logger.error(`Cloudinary delete (${resource_type}) failed: ${error?.message ?? error}`));
        }
    }
}
