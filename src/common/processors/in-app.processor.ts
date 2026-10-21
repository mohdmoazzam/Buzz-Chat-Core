import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { isForeignKeyViolation } from "../errors";
import { PrismaService } from "../../core/prisma.service";
import { RealtimeService } from "../../core/realtime.service";
import { NEW_NOTIFICATION } from "../../socket/events";
import { NOTIFICATION_INCLUDE, serializeNotification } from "../../modules/notification/notification.serializer";
import { IN_APP_QUEUE, type InAppJob } from "../../modules/notification/notification.types";

/** Stores queued in-app notifications (rendered when queued) and pushes them to the user's open sockets. */
@Processor(IN_APP_QUEUE, { concurrency: 10 })
export class InAppProcessor extends WorkerHost {
    private readonly logger = new Logger(InAppProcessor.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly realtime: RealtimeService,
    ) {
        super();
    }

    async process(job: Job<InAppJob>): Promise<void> {
        const { id, user_id, actor_id, type, title, body, data } = job.data;

        // The id comes from the job, so a retry after a partial failure doesn't insert twice
        const row = { id, user_id, type, title, body, data };
        try {
            await this.prisma.notifications.createMany({ data: [{ ...row, actor_id }], skipDuplicates: true });
        } catch (error) {
            if (!isForeignKeyViolation(error)) throw error;
            // The actor or recipient was deleted since queuing; without the actor it's still worth storing
            if (actor_id) {
                await this.prisma.notifications
                    .createMany({ data: [{ ...row, actor_id: null }], skipDuplicates: true })
                    .catch((retryError) => {
                        if (!isForeignKeyViolation(retryError)) throw retryError;
                    });
            }
        }
        // Recipient deleted in the meantime: nothing was stored, nothing to push
        const notification = await this.prisma.notifications.findUnique({ where: { id }, include: NOTIFICATION_INCLUDE });
        if (notification) {
            this.realtime.emitToUsers([user_id], NEW_NOTIFICATION, serializeNotification(notification));
        }
    }

    @OnWorkerEvent("failed")
    onFailed(job: Job<InAppJob> | undefined, error: Error): void {
        if (job) this.logger.error(`"${job.data.type}" notification (job ${job.id}) failed: ${error.message}`);
    }
}
