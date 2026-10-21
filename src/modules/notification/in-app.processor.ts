import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { PrismaService } from "../../core/prisma.service";
import { RealtimeService } from "../../core/realtime.service";
import { NEW_NOTIFICATION } from "../../socket/events";
import { fullName } from "../user/user.names";
import { NAME_SELECT } from "../user/user.serializer";
import { renderInApp } from "./in-app.templates";
import { NOTIFICATION_INCLUDE, serializeNotification } from "./notification.serializer";
import { IN_APP_QUEUE, type InAppJob } from "./notification.types";

/** Stores queued in-app notifications and pushes them to the user's open sockets. */
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
        const { id, user_id, actor_id, type, data } = job.data;

        const actor = actor_id ? await this.prisma.users.findUnique({ where: { id: actor_id }, select: NAME_SELECT }) : null;
        const { title, body } = renderInApp(type, data, actor ? fullName(actor) : "Someone");

        // The id comes from the job, so a retry after a partial failure doesn't insert twice
        await this.prisma.notifications.createMany({
            data: [{ id, user_id, actor_id: actor ? actor_id : null, type, title, body, data }],
            skipDuplicates: true,
        });
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
