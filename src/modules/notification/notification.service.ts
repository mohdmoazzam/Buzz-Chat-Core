import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import type { Queue } from "bullmq";
import { randomUUID } from "crypto";
import {
    EMAIL_QUEUE,
    IN_APP_QUEUE,
    type EmailJob,
    type EmailTemplate,
    type EmailTemplateData,
    type InAppJob,
    type InAppTemplateData,
    type InAppType,
} from "./notification.types";

// A Redis outage shouldn't hang the request that triggered the notification
const ENQUEUE_TIMEOUT_MS = 5000;

const withTimeout = <T>(promise: Promise<T>): Promise<T> =>
    Promise.race([
        promise,
        new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Timed out adding the job to the queue")), ENQUEUE_TIMEOUT_MS).unref()
        ),
    ]);

/**
 * Producer side of the notification system: puts jobs on the Redis queues.
 * The workers (EmailProcessor, InAppProcessor) render and deliver them with retries.
 */
@Injectable()
export class NotificationService {
    private readonly logger = new Logger(NotificationService.name);

    constructor(
        @InjectQueue(EMAIL_QUEUE) private readonly emailQueue: Queue<EmailJob>,
        @InjectQueue(IN_APP_QUEUE) private readonly inAppQueue: Queue<InAppJob>,
    ) {}

    /** Queues an email. Throws a 503 if it couldn't be queued, so callers can tell the user. */
    async email<T extends EmailTemplate>(to: string, template: T, data: EmailTemplateData[T]): Promise<void> {
        try {
            await withTimeout(this.emailQueue.add(template, { to, template, data }));
        } catch (error) {
            this.logger.error(`Couldn't queue "${template}" email: ${(error as Error)?.message ?? error}`);
            throw new ServiceUnavailableException("Couldn't send the email right now. Please try again.");
        }
    }

    /**
     * Queues an in-app notification for each user. Best effort: the action that triggered it
     * already succeeded, so a queue failure is logged instead of thrown.
     */
    async inApp<T extends InAppType>(userIds: string[], type: T, data: InAppTemplateData[T], actorId: string | null = null): Promise<void> {
        const recipients = [...new Set(userIds)].filter((id) => id !== actorId);
        if (!recipients.length) return;
        try {
            await withTimeout(
                this.inAppQueue.addBulk(
                    recipients.map((user_id) => ({
                        name: type,
                        data: { id: randomUUID(), user_id, actor_id: actorId, type, data } as InAppJob,
                    }))
                )
            );
        } catch (error) {
            this.logger.error(`Couldn't queue "${type}" notifications: ${(error as Error)?.message ?? error}`);
        }
    }
}
