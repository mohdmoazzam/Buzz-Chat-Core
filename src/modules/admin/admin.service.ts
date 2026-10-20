import { Injectable } from "@nestjs/common";
import { createHash, timingSafeEqual } from "crypto";
import { config } from "../../config/env";
import { PrismaService } from "../../core/prisma.service";
import { groupAvatar, MEMBER_ORDER } from "../chat/chat.access";
import { ATTACHMENTS_INCLUDE, withAssets } from "../message/message.service";
import { PERSON_SELECT } from "../user/user.serializer";

const sha256 = (value: string) => createHash("sha256").update(value).digest();

const PERSON = { select: PERSON_SELECT } as const;

@Injectable()
export class AdminService {
    constructor(private readonly prisma: PrismaService) {}

    isAdminKey(secretKey: unknown): boolean {
        const expected = config.adminSecretKey;
        return !!expected && typeof secretKey === "string" && timingSafeEqual(sha256(secretKey), sha256(expected));
    }

    async getAllUsers() {
        // One grouped count instead of two count queries per user
        const [users, counts] = await Promise.all([
            this.prisma.users.findMany({ select: { ...PERSON_SELECT, username: true } }),
            this.prisma.$queryRaw<{ user_id: string; group_chat: boolean; count: number }[]>`
                SELECT cm.user_id, c.group_chat, COUNT(*)::int AS count
                FROM chat_members cm JOIN chats c ON c.id = cm.chat_id
                GROUP BY cm.user_id, c.group_chat`,
        ]);

        const countFor = new Map(counts.map(({ user_id, group_chat, count }) => [`${user_id}:${group_chat}`, count]));
        return users.map((user) => ({
            ...user,
            groups_count: countFor.get(`${user.id}:true`) ?? 0,
            friends_count: countFor.get(`${user.id}:false`) ?? 0,
        }));
    }

    async getAllChats() {
        const chats = await this.prisma.chats.findMany({
            include: {
                members: { orderBy: MEMBER_ORDER, select: { user: PERSON } },
                creator: PERSON,
                _count: { select: { messages: true } },
            },
        });

        return chats.map((chat) => {
            const members = chat.members.map((member) => member.user);
            return {
                id: chat.id,
                name: chat.name,
                group_chat: chat.group_chat,
                avatar: groupAvatar({ avatar: null }, members.map((member) => member.avatar.url)),
                members,
                creator: chat.creator,
                total_members: members.length,
                total_messages: chat._count.messages,
            };
        });
    }

    async getAllMessages() {
        const messages = await this.prisma.messages.findMany({
            orderBy: { created_at: "desc" },
            take: 1000,
            include: { sender: PERSON, chat: { select: { group_chat: true } }, attachments: ATTACHMENTS_INCLUDE },
        });

        return messages.map(({ chat, ...message }) => ({ ...withAssets(message), group_chat: chat.group_chat }));
    }

    async getDashboardStats() {
        const DAY_MS = 24 * 60 * 60 * 1000;
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const since = new Date(startOfToday.getTime() - 6 * DAY_MS);

        const [groups_count, users_count, messages_count, total_chats_count, recent] = await Promise.all([
            this.prisma.chats.count({ where: { group_chat: true } }),
            this.prisma.users.count(),
            this.prisma.messages.count(),
            this.prisma.chats.count(),
            this.prisma.messages.findMany({ where: { created_at: { gte: since } }, select: { created_at: true } }),
        ]);

        // Index 6 = today, 0 = six days ago (matches the dashboard chart labels)
        const messages_chart: number[] = new Array(7).fill(0);
        const endOfToday = startOfToday.getTime() + DAY_MS - 1;
        recent.forEach(({ created_at }) => {
            const daysAgo = Math.floor((endOfToday - created_at.getTime()) / DAY_MS);
            if (daysAgo >= 0 && daysAgo < 7) messages_chart[6 - daysAgo]++;
        });

        return { groups_count, users_count, messages_count, total_chats_count, messages_chart };
    }
}
