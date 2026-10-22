import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { config } from "../../config/env";
import { ChatModule } from "../chat/chat.module";
import { MessageController } from "./message.controller";
import { LINK_PREVIEW_QUEUE } from "./link-preview/link-preview.fetcher";
import { LinkPreviewProcessor } from "./link-preview/link-preview.processor";
import { MESSAGE_CLEANUP_QUEUE, MessageCleanupProcessor } from "./message-cleanup.processor";
import { MessageService } from "./message.service";

@Module({
    imports: [
        ChatModule,
        // Link previews are fetched off the request path; a failed fetch just means no card
        BullModule.registerQueue({
            name: LINK_PREVIEW_QUEUE,
            defaultJobOptions: {
                attempts: 2,
                backoff: { type: "exponential", delay: 3000 },
                removeOnComplete: true,
                removeOnFail: { age: 24 * 60 * 60 },
            },
        }),
        // Disappearing messages: a repeating job deletes expired ones
        BullModule.registerQueue({ name: MESSAGE_CLEANUP_QUEUE }),
    ],
    controllers: [MessageController],
    // Same switch as the notification workers (NOTIFICATION_WORKERS=false runs them elsewhere)
    providers: [MessageService, ...(config.notificationWorkers ? [LinkPreviewProcessor, MessageCleanupProcessor] : [])],
    exports: [MessageService],
})
export class MessageModule {}
