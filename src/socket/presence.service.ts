import { Injectable } from "@nestjs/common";
import { PrismaService } from "../core/prisma.service";
import { RealtimeService } from "../core/realtime.service";
import { ChatAccess } from "../modules/chat/chat.access";
import { ONLINE_USERS, USER_LAST_SEEN } from "./events";

/** Who is online, shared only with each user's own contacts. */
@Injectable()
export class PresenceService {
    // userId -> number of connected sockets (a user can have several tabs/devices)
    private readonly connectionCounts = new Map<string, number>();

    constructor(
        private readonly access: ChatAccess,
        private readonly realtime: RealtimeService,
        private readonly prisma: PrismaService,
    ) {}

    isOnline(userId: string): boolean {
        return this.connectionCounts.has(userId);
    }

    async userConnected(userId: string): Promise<void> {
        const wasOnline = this.isOnline(userId);
        this.connectionCounts.set(userId, (this.connectionCounts.get(userId) ?? 0) + 1);
        if (!wasOnline) await this.notifyContacts(userId);
        await this.sendPresenceTo(userId);
    }

    async userDisconnected(userId: string): Promise<void> {
        const remaining = (this.connectionCounts.get(userId) ?? 1) - 1;
        if (remaining > 0) {
            this.connectionCounts.set(userId, remaining);
            return;
        }
        this.connectionCounts.delete(userId);
        const lastSeenAt = new Date();
        await this.prisma.users.update({
            where: { id: userId },
            data: { last_seen_at: lastSeenAt },
            select: { id: true },
        });
        const contacts = await this.access.getContactIds(userId);
        const onlineContacts = contacts.filter((id) => this.isOnline(id));
        this.realtime.emitToUsers(onlineContacts, USER_LAST_SEEN, {
            user_id: userId,
            last_seen_at: lastSeenAt.toISOString(),
        });
        await Promise.all(onlineContacts.map((id) => this.sendPresenceTo(id)));
    }

    /** Re-sends the user's view of which contacts are online. */
    async sendPresenceTo(userId: string): Promise<void> {
        const contacts = await this.access.getContactIds(userId);
        this.realtime.emitToUsers(
            [userId],
            ONLINE_USERS,
            contacts.filter((id) => this.isOnline(id)),
        );
    }

    private async notifyContacts(userId: string): Promise<void> {
        const contacts = await this.access.getContactIds(userId);
        await Promise.all(contacts.filter((id) => this.isOnline(id)).map((id) => this.sendPresenceTo(id)));
    }
}
