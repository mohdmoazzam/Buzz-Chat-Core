import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { errorMessage } from "../../common/errors";
import { Logger, type OnModuleInit } from "@nestjs/common";
import type { Queue } from "bullmq";
import { PrismaService } from "../../core/prisma.service";
import { RealtimeService } from "../../core/realtime.service";
import { MESSAGES_EXPIRED } from "../../socket/events";
import { AssetsService } from "../assets/assets.service";

export const MESSAGE_CLEANUP_QUEUE = "message-cleanup";
const EVERY_MS = 60 * 1000;
// Rows per delete, so one run never holds a huge transaction
const BATCH = 500;

/**
 * Disappearing messages: once a minute, deletes messages whose expires_at has passed (the whole row,
 * not a "deleted" placeholder), removes files nothing else uses, and tells each chat's members which
 * messages went (MESSAGES_EXPIRED). Clients also hide expired messages on their own between runs.
 */
@Processor(MESSAGE_CLEANUP_QUEUE)
export class MessageCleanupProcessor extends WorkerHost implements OnModuleInit {
    private readonly logger = new Logger(MessageCleanupProcessor.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly realtime: RealtimeService,
        private readonly assets: AssetsService,
        @InjectQueue(MESSAGE_CLEANUP_QUEUE) private readonly queue: Queue,
    ) {
        super();
    }

    // Idempotent: every process (and restart) upserts the same repeating job
    async onModuleInit(): Promise<void> {
        await this.queue
            .upsertJobScheduler(
                "expire-messages",
                { every: EVERY_MS },
                { name: "expire", opts: { removeOnComplete: true, removeOnFail: 50 } },
            )
            .catch((error) => this.logger.error(`Couldn't schedule message cleanup: ${errorMessage(error)}`));
    }

    async process(): Promise<void> {
        let total = 0;
        for (;;) {
            const expired = await this.prisma.messages.findMany({
                where: { expires_at: { lte: new Date() } },
                orderBy: { expires_at: "asc" },
                take: BATCH,
                select: { id: true, chat_id: true, attachments: { select: { asset_id: true } } },
            });
            if (!expired.length) break;

            const ids = expired.map((message) => message.id);
            // Replies to these keep going without their quote (reply_to_id is ON DELETE SET NULL)
            await this.prisma.messages.deleteMany({ where: { id: { in: ids } } });
            this.assets.removeInBackground(expired.flatMap((message) => message.attachments.map((a) => a.asset_id)));

            const byChat = new Map<string, string[]>();
            expired.forEach(({ id, chat_id }) => byChat.set(chat_id, [...(byChat.get(chat_id) ?? []), id]));
            const members = await this.prisma.chat_members.findMany({
                where: { chat_id: { in: [...byChat.keys()] } },
                select: { chat_id: true, user_id: true },
            });
            for (const [chatId, messageIds] of byChat) {
                const memberIds = members.filter((m) => m.chat_id === chatId).map((m) => m.user_id);
                this.realtime.emitToUsers(memberIds, MESSAGES_EXPIRED, { chat_id: chatId, message_ids: messageIds });
            }
            total += ids.length;
            if (expired.length < BATCH) break;
        }
        if (total) this.logger.log(`Deleted ${total} expired message${total === 1 ? "" : "s"}`);
    }
}
