import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { PrismaService } from "../../../core/prisma.service";
import { RealtimeService } from "../../../core/realtime.service";
import { MESSAGE_UPDATED } from "../../../socket/events";
import { MESSAGE_INCLUDE, withAssets } from "../message.serializer";
import { fetchLinkPreview, firstUrl, LINK_PREVIEW_QUEUE, type LinkPreviewJob } from "./link-preview.fetcher";

/**
 * Fills in a message's link preview after it was sent, then pushes the updated message to the chat
 * (MESSAGE_UPDATED, like an edit), so the card appears a moment later without a refresh.
 */
@Processor(LINK_PREVIEW_QUEUE, { concurrency: 5 })
export class LinkPreviewProcessor extends WorkerHost {
    private readonly logger = new Logger(LinkPreviewProcessor.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly realtime: RealtimeService,
    ) {
        super();
    }

    async process(job: Job<LinkPreviewJob>): Promise<void> {
        const message = await this.prisma.messages.findUnique({
            where: { id: job.data.message_id },
            select: { id: true, chat_id: true, content: true, deleted_at: true },
        });
        const url = firstUrl(message?.content);
        if (!message || message.deleted_at || !url) return;

        let preview;
        try {
            preview = await fetchLinkPreview(url);
        } catch (error) {
            // Unreachable, not public, not HTML, timed out: no card, and not worth retrying
            this.logger.debug(`No preview for ${url}: ${(error as Error)?.message ?? error}`);
            return;
        }
        if (!preview) return;

        // Only if it's still the same text (it may have been edited or deleted while fetching)
        const { count } = await this.prisma.messages.updateMany({
            where: { id: message.id, content: message.content, deleted_at: null },
            data: { link_preview: { ...preview } },
        });
        if (!count) return;

        const [row, members] = await Promise.all([
            this.prisma.messages.findUniqueOrThrow({ where: { id: message.id }, include: MESSAGE_INCLUDE }),
            this.prisma.chat_members.findMany({ where: { chat_id: message.chat_id }, select: { user_id: true } }),
        ]);
        this.realtime.emitToUsers(
            members.map((member) => member.user_id),
            MESSAGE_UPDATED,
            { chat_id: message.chat_id, message: withAssets(row) },
        );
    }
}
