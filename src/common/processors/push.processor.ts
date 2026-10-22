import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import webpush, { WebPushError } from "web-push";
import { config } from "../../config/env";
import { PrismaService } from "../../core/prisma.service";
import { RealtimeService } from "../../core/realtime.service";
import { PUSH_QUEUE, type PushJob } from "../../modules/notification/notification.types";

// A push still undelivered after this long (device off) is dropped by the push service
const PUSH_TTL_SECONDS = 12 * 60 * 60;

const VAPID = { subject: config.webPush.subject, publicKey: config.webPush.publicKey, privateKey: config.webPush.privateKey };

/**
 * Sends queued pushes to each of the user's subscribed devices, except devices that have the app
 * open (a socket connected), which already get the live in-app alert. That check only sees this
 * process's sockets, so with NOTIFICATION_WORKERS=false (workers elsewhere) every device is pushed.
 */
@Processor(PUSH_QUEUE, { concurrency: 10 })
export class PushProcessor extends WorkerHost {
    private readonly logger = new Logger(PushProcessor.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly realtime: RealtimeService,
    ) {
        super();
    }

    async process(job: Job<PushJob>): Promise<void> {
        const { user_id, sent = [], ...payload } = job.data;
        const subscriptions = await this.prisma.push_subscriptions.findMany({
            where: { user_id, endpoint: { notIn: sent }, session: { expires_at: { gt: new Date() } } },
            select: { id: true, session_id: true, endpoint: true, p256dh: true, auth: true },
        });

        const body = JSON.stringify(payload);
        const delivered = [...sent];
        const gone: string[] = [];
        let failed = 0;
        await Promise.all(
            subscriptions
                .filter((sub) => !this.realtime.isSessionConnected(sub.session_id))
                .map(async (sub) => {
                    try {
                        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, {
                            TTL: PUSH_TTL_SECONDS,
                            urgency: "high",
                            vapidDetails: VAPID,
                        });
                        delivered.push(sub.endpoint);
                    } catch (error) {
                        const status = error instanceof WebPushError ? error.statusCode : 0;
                        // The browser unsubscribed or the subscription expired: forget the device
                        if (status === 404 || status === 410) return void gone.push(sub.id);
                        // Other client errors (bad keys, payload) won't succeed on a retry
                        if (status >= 400 && status < 500 && status !== 429) {
                            this.logger.warn(`Push to a device of user ${user_id} rejected (${status})`);
                            return void delivered.push(sub.endpoint);
                        }
                        failed++;
                    }
                }),
        );

        if (gone.length) await this.prisma.push_subscriptions.deleteMany({ where: { id: { in: gone } } });
        if (failed) {
            // Retry only the devices that failed
            await job.updateData({ ...job.data, sent: delivered });
            throw new Error(`${failed} of ${subscriptions.length} pushes failed`);
        }
    }

    @OnWorkerEvent("failed")
    onFailed(job: Job<PushJob> | undefined, error: Error): void {
        if (job) this.logger.error(`Push (job ${job.id}) failed on attempt ${job.attemptsMade}: ${error.message}`);
    }
}
