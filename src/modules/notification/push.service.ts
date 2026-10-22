import { InjectQueue } from "@nestjs/bullmq";
import { BadRequestException, Injectable } from "@nestjs/common";
import type { Queue } from "bullmq";
import { config } from "../../config/env";
import { PrismaService } from "../../core/prisma.service";
import { isPushServiceUrl, type PushSubscriptionDto } from "./push.dto";
import { PUSH_QUEUE, type PushJob } from "./notification.types";

/**
 * Web push: stores each device's subscription and queues pushes for PushProcessor to send.
 * Turned off (no-ops) when the VAPID keys aren't configured.
 */
@Injectable()
export class PushService {
    readonly enabled = !!(config.webPush.publicKey && config.webPush.privateKey);

    constructor(
        private readonly prisma: PrismaService,
        @InjectQueue(PUSH_QUEUE) private readonly queue: Queue<PushJob>,
    ) {}

    get publicKey(): string | null {
        return this.enabled ? config.webPush.publicKey : null;
    }

    /** Saves this device's subscription for the logged-in session (a browser has one endpoint, so it may move between users). */
    async subscribe(userId: string, sessionId: string, dto: PushSubscriptionDto): Promise<void> {
        if (!this.enabled) throw new BadRequestException("Push notifications aren't available right now");
        if (!isPushServiceUrl(dto.endpoint)) throw new BadRequestException("This browser's push service isn't supported");

        const row = { user_id: userId, session_id: sessionId, p256dh: dto.p256dh, auth: dto.auth };
        await this.prisma.push_subscriptions.upsert({
            where: { endpoint: dto.endpoint },
            create: { endpoint: dto.endpoint, ...row },
            update: row,
            select: { id: true },
        });
    }

    /** Stops pushes to this device (the current session). */
    async unsubscribe(sessionId: string): Promise<void> {
        await this.prisma.push_subscriptions.deleteMany({ where: { session_id: sessionId } });
    }

    /**
     * Queues pushes, skipping users with no subscribed device (most of them, so most messages
     * add no jobs). Rejects if the queue can't be reached; best-effort callers catch.
     */
    async enqueue(jobs: PushJob[]): Promise<void> {
        if (!this.enabled || !jobs.length) return;
        const rows = await this.prisma.push_subscriptions.findMany({
            where: { user_id: { in: [...new Set(jobs.map((job) => job.user_id))] } },
            select: { user_id: true },
            distinct: ["user_id"],
        });
        const subscribed = new Set(rows.map((row) => row.user_id));
        const wanted = jobs.filter((job) => subscribed.has(job.user_id));
        if (wanted.length) await this.queue.addBulk(wanted.map((job) => ({ name: "push", data: job })));
    }
}
