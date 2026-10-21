import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma.service';
import { RealtimeService } from '../../core/realtime.service';
import { MESSAGES_READ } from '../../socket/events';

export interface ReadReceipt {
    user_id: string;
    /** Everything sent up to this moment has been read. */
    last_read_at: Date;
    /** Messages from before someone joined weren't theirs to read. */
    joined_at: Date;
}

/**
 * Read receipts and unread counts, both from chat_members.last_read_at.
 * "Read up to" is always a message's created_at, never the clock, so comparisons
 * between message times and read times can't drift.
 */
@Injectable()
export class ReadStateService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly realtime: RealtimeService,
    ) {}

    /**
     * Marks the chat as read up to its newest message and tells every member (including the
     * reader's other devices). Returns the new read time, or null if nothing was new.
     */
    async markRead(chatId: string, userId: string, memberIds: string[]): Promise<Date | null> {
        // One statement; the row is only written when there's a newer message
        const rows = await this.prisma.$queryRaw<{ last_read_at: Date }[]>`
            UPDATE chat_members cm
            SET last_read_at = latest.created_at
            FROM (SELECT max(created_at) AS created_at FROM messages WHERE chat_id = ${chatId}::uuid) latest
            WHERE cm.chat_id = ${chatId}::uuid
              AND cm.user_id = ${userId}::uuid
              AND latest.created_at > cm.last_read_at
            RETURNING cm.last_read_at`;
        const readAt = rows[0]?.last_read_at ?? null;
        if (readAt) this.announce(chatId, userId, readAt, memberIds);
        return readAt;
    }

    /** Sending a message counts as having read the chat up to it. */
    async markSent(chatId: string, userId: string, sentAt: Date, memberIds: string[]): Promise<void> {
        const { count } = await this.prisma.chat_members.updateMany({
            where: {
                chat_id: chatId,
                user_id: userId,
                last_read_at: { lt: sentAt },
            },
            data: { last_read_at: sentAt },
        });
        if (count) this.announce(chatId, userId, sentAt, memberIds);
    }

    /** Unread messages per chat for the user (only chats with some are in the map). */
    async unreadCounts(userId: string, chatIds: string[]): Promise<Map<string, number>> {
        if (!chatIds.length) return new Map();
        const rows = await this.prisma.$queryRaw<{ chat_id: string; unread: number }[]>`
            SELECT cm.chat_id, COUNT(m.id)::int AS unread
            FROM chat_members cm
            JOIN messages m ON m.chat_id = cm.chat_id
                AND m.created_at > cm.last_read_at
                AND m.sender_id <> cm.user_id
                AND m.deleted_at IS NULL
            WHERE cm.user_id = ${userId}::uuid AND cm.chat_id = ANY(${chatIds}::uuid[])
            GROUP BY cm.chat_id`;
        return new Map(rows.map(({ chat_id, unread }) => [chat_id, unread]));
    }

    /** Unread messages across all of the user's chats. */
    async totalUnread(userId: string): Promise<number> {
        const [row] = await this.prisma.$queryRaw<{ unread: number }[]>`
            SELECT COUNT(m.id)::int AS unread
            FROM chat_members cm
            JOIN messages m ON m.chat_id = cm.chat_id
                AND m.created_at > cm.last_read_at
                AND m.sender_id <> cm.user_id
                AND m.deleted_at IS NULL
            WHERE cm.user_id = ${userId}::uuid`;
        return row?.unread ?? 0;
    }

    /** How far each other member has read, for the ticks on the user's own messages. */
    receipts(chatId: string, exceptUserId: string): Promise<ReadReceipt[]> {
        return this.prisma.chat_members.findMany({
            where: {
                chat_id: chatId,
                user_id: { not: exceptUserId },
            },
            select: {
                user_id: true,
                last_read_at: true,
                joined_at: true,
            },
        });
    }

    private announce(chatId: string, userId: string, readAt: Date, memberIds: string[]): void {
        this.realtime.emitToUsers(memberIds, MESSAGES_READ, { chat_id: chatId, user_id: userId, read_at: readAt });
    }
}
