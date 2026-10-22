import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { errorMessage } from "../../common/errors";
import { PrismaService } from "../../core/prisma.service";
import { StorageService } from "../../core/storage.service";

/** What clients get back for an uploaded file, and what attachments embed. */
export const ASSET_SELECT = {
    id: true,
    url: true,
    resource_type: true,
    mime_type: true,
    size_bytes: true,
    original_name: true,
    created_at: true,
} as const;

interface UseOptions {
    /** Only images are allowed (avatars, group pictures). */
    imagesOnly?: boolean;
}

@Injectable()
export class AssetsService {
    private readonly logger = new Logger(AssetsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly storage: StorageService,
    ) {}

    /**
     * Uploads files to Cloudinary and records them. `uploadedBy` is null for uploads
     * made before signing up (the register avatar).
     */
    async upload(files: Express.Multer.File[], uploadedBy: string | null) {
        if (!files.length) {
            throw new BadRequestException("Please choose a file to upload");
        }
        const stored = await this.storage.upload(files);
        try {
            return await this.prisma.$transaction(
                stored.map((file, index) =>
                    this.prisma.assets.create({
                        data: {
                            public_id: file.public_id,
                            url: file.url,
                            resource_type: file.resource_type,
                            mime_type: files[index].mimetype,
                            size_bytes: files[index].size,
                            original_name: files[index].originalname,
                            uploaded_by: uploadedBy,
                        },
                        select: ASSET_SELECT,
                    }),
                ),
            );
        } catch (error) {
            // Don't leave files on Cloudinary that nothing points to
            this.storage.removeInBackground(stored.map((file) => file.public_id));
            throw error;
        }
    }

    /**
     * Checks that assets can be attached to something: they exist, belong to `ownerId`
     * (or, for sign-up, were uploaded anonymously), and aren't already in use elsewhere.
     */
    async assertUsable(assetIds: string[], ownerId: string | null, { imagesOnly = false }: UseOptions = {}): Promise<void> {
        const assets = await this.prisma.assets.findMany({
            where: { id: { in: assetIds } },
            select: {
                uploaded_by: true,
                mime_type: true,
                _count: { select: { user_avatars: true, user_covers: true, chat_avatars: true, message_attachments: true } },
            },
        });

        const usable =
            assets.length === new Set(assetIds).size &&
            assets.every(
                (asset) =>
                    asset.uploaded_by === ownerId &&
                    !asset._count.user_avatars &&
                    !asset._count.user_covers &&
                    !asset._count.chat_avatars &&
                    !asset._count.message_attachments,
            );
        if (!usable) {
            throw new BadRequestException("File not found. Please upload it again.");
        }
        if (imagesOnly && !assets.every((asset) => asset.mime_type.startsWith("image/"))) {
            throw new BadRequestException("Please upload an image file");
        }
    }

    /**
     * Deletes asset rows and their Cloudinary files without making the caller wait.
     * Assets still in use elsewhere (e.g. by a forwarded copy of a message) are kept.
     */
    removeInBackground(assetIds: Array<string | null | undefined>): void {
        const ids = assetIds.filter((id): id is string => Boolean(id));
        if (!ids.length) return;
        (async () => {
            const assets = await this.prisma.assets.findMany({
                where: {
                    id: { in: ids },
                    user_avatars: { none: {} },
                    user_covers: { none: {} },
                    chat_avatars: { none: {} },
                    message_attachments: { none: {} },
                },
                select: { id: true, public_id: true },
            });
            if (!assets.length) return;
            await this.prisma.assets.deleteMany({ where: { id: { in: assets.map((asset) => asset.id) } } });
            this.storage.removeInBackground(assets.map((asset) => asset.public_id));
        })().catch((error) => this.logger.error(`Asset cleanup failed: ${errorMessage(error)}`));
    }
}
