import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import type { Queue } from "bullmq";
import { randomUUID } from "crypto";
import { PrismaService } from "../../core/prisma.service";
import { fullName } from "../user/user.names";
import { buildEmail, buildInApp } from "./notification.templates";
import {
    EMAIL_QUEUE,
    IN_APP_QUEUE,
    NOTIFICATION_CHANNELS,
    type EmailJob,
    type EmailNotificationType,
    type InAppJob,
    type InAppNotificationType,
    type NotificationChannel,
    type NotificationContext,
    type NotificationData,
    type NotificationType,
} from "./notification.types";

// A Redis outage shouldn't hang the request that triggered the notification
const ENQUEUE_TIMEOUT_MS = 5000;

const withTimeout = <T>(promise: Promise<T>): Promise<T> =>
    Promise.race([
        promise,
        new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Timed out adding the job to the queue")), ENQUEUE_TIMEOUT_MS).unref(),
        ),
    ]);

const RECIPIENT_SELECT = { id: true, email: true, first_name: true, last_name: true, username: true } as const;

export interface QueueNotificationOptions<T extends NotificationType> {
    /** Recipient user id(s). The actor is never notified of their own action. */
    to: string | string[];
    data: NotificationData[T];
    /** Who caused it; their name is used in the text. */
    actorId?: string | null;
}

/**
 * Producer side of the notification system: collects what each channel needs and puts the jobs
 * on the Redis queues. The workers (EmailProcessor, InAppProcessor) deliver them with retries.
 */
@Injectable()
export class NotificationService {
    private readonly logger = new Logger(NotificationService.name);

    constructor(
        private readonly prisma: PrismaService,
        @InjectQueue(EMAIL_QUEUE) private readonly emailQueue: Queue<EmailJob>,
        @InjectQueue(IN_APP_QUEUE) private readonly inAppQueue: Queue<InAppJob>,
    ) {}

    /**
     * Queues a notification on every channel its type is configured for (NOTIFICATION_CHANNELS).
     * Throws a 503 if it couldn't be queued; callers for whom it's best effort should catch.
     */
    async queueNotification<T extends NotificationType>(type: T, { to, data, actorId = null }: QueueNotificationOptions<T>): Promise<void> {
        const recipientIds = [...new Set([to].flat())].filter((id) => id !== actorId);
        if (!recipientIds.length) return;
        const channels: readonly NotificationChannel[] = NOTIFICATION_CHANNELS[type];

        try {
            const contexts = await this.collect(recipientIds, actorId, data);
            // Recipients deleted in the meantime: nobody left to notify
            if (!contexts.length) return;
            await withTimeout(Promise.all(channels.map((channel) => this.enqueue(channel, type, contexts, actorId))));
        } catch (error) {
            this.logger.error(`Couldn't queue "${type}" notification: ${(error as Error)?.message ?? error}`);
            throw new ServiceUnavailableException("Couldn't send the notification right now. Please try again.");
        }
    }

    /** Loads the recipients and actor in one query and builds each recipient's context. */
    private async collect<T extends NotificationType>(
        recipientIds: string[],
        actorId: string | null,
        data: NotificationData[T],
    ): Promise<NotificationContext<T>[]> {
        const ids = actorId ? [...recipientIds, actorId] : recipientIds;
        const users = await this.prisma.users.findMany({
            where: { id: { in: ids } },
            select: RECIPIENT_SELECT,
        });

        const actor = actorId ? users.find((user) => user.id === actorId) : undefined;
        const actorName = actor ? fullName(actor) : "Someone";
        return users.filter((user) => user.id !== actorId).map((recipient) => ({ recipient, actorName, data }));
    }

    private async enqueue<T extends NotificationType>(
        channel: NotificationChannel,
        type: T,
        contexts: NotificationContext<T>[],
        actorId: string | null,
    ): Promise<unknown> {
        switch (channel) {
            case "email": {
                const emailType = type as T & EmailNotificationType;
                return this.emailQueue.addBulk(
                    contexts.map((ctx) => {
                        const content = buildEmail(emailType, ctx as NotificationContext<typeof emailType>);
                        return {
                            name: content.template,
                            data: {
                                to: ctx.recipient.email,
                                ...content,
                            },
                        };
                    }),
                );
            }
            case "in_app": {
                const inAppType = type as T & InAppNotificationType;
                return this.inAppQueue.addBulk(
                    contexts.map((ctx) => ({
                        name: inAppType,
                        data: {
                            id: randomUUID(),
                            user_id: ctx.recipient.id,
                            actor_id: actorId,
                            type: inAppType,
                            ...buildInApp(inAppType, ctx as NotificationContext<typeof inAppType>),
                            data: ctx.data as InAppJob["data"],
                        },
                    })),
                );
            }
        }
    }
}
