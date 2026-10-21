import { BullModule } from "@nestjs/bullmq";
import { Global, Module } from "@nestjs/common";
import { config } from "../../config/env";
import { EmailTemplateService } from "./email-template.service";
import { EmailProcessor } from "./email.processor";
import { InAppProcessor } from "./in-app.processor";
import { NotificationInboxService } from "./notification-inbox.service";
import { NotificationController } from "./notification.controller";
import { NotificationService } from "./notification.service";
import { EMAIL_QUEUE, IN_APP_QUEUE } from "./notification.types";

/** ioredis options from a redis:// or rediss:// URL. */
const redisConnection = (url: string) => {
    const parsed = new URL(url);
    return {
        host: parsed.hostname,
        port: Number(parsed.port) || 6379,
        username: decodeURIComponent(parsed.username) || undefined,
        password: decodeURIComponent(parsed.password) || undefined,
        tls: parsed.protocol === "rediss:" ? {} : undefined,
        // Required by BullMQ workers (blocking commands must not time out)
        maxRetriesPerRequest: null,
    };
};

/**
 * Queue-based notifications. Anything can inject NotificationService to send an email or an
 * in-app notification; the jobs go to Redis and the processors deliver them with retries.
 * Set NOTIFICATION_WORKERS=false to only enqueue here and run the workers in another process.
 */
@Global()
@Module({
    imports: [
        BullModule.forRoot({ connection: redisConnection(config.redisUrl), prefix: "buzzchat" }),
        BullModule.registerQueue(
            {
                name: EMAIL_QUEUE,
                defaultJobOptions: {
                    attempts: 5,
                    backoff: { type: "exponential", delay: 5000 },
                    // Jobs can hold one-time codes, so don't keep them around once sent
                    removeOnComplete: true,
                    removeOnFail: { age: 24 * 60 * 60 },
                },
            },
            {
                name: IN_APP_QUEUE,
                defaultJobOptions: {
                    attempts: 3,
                    backoff: { type: "exponential", delay: 2000 },
                    removeOnComplete: { count: 1000 },
                    removeOnFail: { age: 7 * 24 * 60 * 60 },
                },
            },
        ),
    ],
    controllers: [NotificationController],
    providers: [
        NotificationService,
        NotificationInboxService,
        EmailTemplateService,
        ...(config.notificationWorkers ? [EmailProcessor, InAppProcessor] : []),
    ],
    exports: [NotificationService],
})
export class NotificationModule {}
