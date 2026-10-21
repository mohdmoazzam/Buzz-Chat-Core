import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { isValidId } from "../../common/utils/ids";
import { paginationMeta, parsePagination, type PaginationOptions } from "../../common/utils/pagination";
import { PrismaService } from "../../core/prisma.service";
import { NOTIFICATION_INCLUDE, serializeNotification } from "./notification.serializer";

const INBOX_PAGINATION = {
    orderFields: { created_at: ["created_at"] },
    defaultOrderBy: "created_at",
    defaultOrder: "desc",
    defaultTake: 20,
    maxTake: 50,
} satisfies PaginationOptions<"created_at", "created_at">;

/** Reading side of in-app notifications: the user's inbox and read state. */
@Injectable()
export class NotificationInboxService {
    constructor(private readonly prisma: PrismaService) {}

    /** Query: ?page=1&take=20&unread=true */
    async list(me: string, query: Record<string, unknown>) {
        const { page, take, skip, orderBy } = parsePagination(query, INBOX_PAGINATION);
        const where = { user_id: me, ...(query.unread === "true" ? { read_at: null } : {}) };

        const [rows, total, unread_count] = await Promise.all([
            this.prisma.notifications.findMany({ where, orderBy, skip, take, include: NOTIFICATION_INCLUDE }),
            this.prisma.notifications.count({ where }),
            this.unreadCount(me),
        ]);
        return { data: rows.map(serializeNotification), unread_count, pagination: paginationMeta(page, take, total) };
    }

    unreadCount(me: string): Promise<number> {
        return this.prisma.notifications.count({ where: { user_id: me, read_at: null } });
    }

    async markRead(me: string, id: unknown): Promise<void> {
        if (!isValidId(id)) throw new BadRequestException("Invalid notification");
        const { count } = await this.prisma.notifications.updateMany({
            where: { id, user_id: me, read_at: null },
            data: { read_at: new Date() },
        });
        // Already read is fine; only someone else's (or a missing) notification is an error
        if (!count && !(await this.prisma.notifications.findFirst({ where: { id, user_id: me }, select: { id: true } }))) {
            throw new NotFoundException("Notification not found");
        }
    }

    async markAllRead(me: string): Promise<number> {
        const { count } = await this.prisma.notifications.updateMany({
            where: { user_id: me, read_at: null },
            data: { read_at: new Date() },
        });
        return count;
    }

    async remove(me: string, id: unknown): Promise<void> {
        if (!isValidId(id)) throw new BadRequestException("Invalid notification");
        const { count } = await this.prisma.notifications.deleteMany({ where: { id, user_id: me } });
        if (!count) throw new NotFoundException("Notification not found");
    }
}
