import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { isValidId } from "../../common/utils/ids";
import { PrismaService } from "../../core/prisma.service";
import type { chats, Prisma } from "../../../prisma/generated/client";
import { AVATAR_SELECT } from "../user/user.serializer";

// Members in join order (the longest-standing member comes first)
export const MEMBER_ORDER = [{ joined_at: "asc" }, { user_id: "asc" }] satisfies Prisma.chat_membersOrderByWithRelationInput[];

const WITH_MEMBER_IDS = {
    members: { select: { user_id: true }, orderBy: MEMBER_ORDER },
    avatar: AVATAR_SELECT,
} satisfies Prisma.chatsInclude;

export type ChatWithMemberIds = Prisma.chatsGetPayload<{ include: typeof WITH_MEMBER_IDS }>;

export const memberIdsOf = (chat: ChatWithMemberIds): string[] => chat.members.map((member) => member.user_id);

/** Group picture if set, otherwise the first few member photos. */
export const groupAvatar = (chat: { avatar: { url: string } | null }, memberAvatars: string[]): string[] =>
    chat.avatar ? [chat.avatar.url] : memberAvatars.slice(0, 3).filter(Boolean);

/** Chat membership and relationship lookups shared by chats, groups, messages, friends and sockets. */
@Injectable()
export class ChatAccess {
    constructor(private readonly prisma: PrismaService) {}

    /** The chat if the user belongs to it, otherwise null. */
    async loadForMember(chatId: unknown, userId: string): Promise<ChatWithMemberIds | null> {
        if (!isValidId(chatId)) return null;
        const chat = await this.prisma.chats.findUnique({ where: { id: chatId }, include: WITH_MEMBER_IDS });
        return chat && memberIdsOf(chat).includes(userId) ? chat : null;
    }

    /** Loads a chat and asserts the user belongs to it (404 either way, so ids can't be probed). */
    async findForMember(chatId: unknown, userId: string): Promise<ChatWithMemberIds> {
        const chat = await this.loadForMember(chatId, userId);
        if (!chat) throw new NotFoundException("Chat not found");
        return chat;
    }

    assertGroupCreator(chat: Pick<chats, "group_chat" | "creator_id">, userId: string, action: string): void {
        if (!chat.group_chat) throw new BadRequestException("This is not a group chat");
        if (chat.creator_id !== userId) throw new ForbiddenException(`Only the group admin can ${action}`);
    }

    /** Ids of everyone the user has a 1:1 chat with. */
    async getFriendIds(userId: string): Promise<Set<string>> {
        const rows = await this.prisma.chat_members.findMany({
            where: { user_id: { not: userId }, chat: { group_chat: false, members: { some: { user_id: userId } } } },
            select: { user_id: true },
        });
        return new Set(rows.map((row) => row.user_id));
    }

    /** Ids of everyone who shares any chat with the user (used for presence). */
    async getContactIds(userId: string): Promise<string[]> {
        const rows = await this.prisma.chat_members.findMany({
            where: { user_id: { not: userId }, chat: { members: { some: { user_id: userId } } } },
            select: { user_id: true },
            distinct: ["user_id"],
        });
        return rows.map((row) => row.user_id);
    }

    /** Bumps updated_at so chat lists sort by latest activity. */
    touch(chatId: string) {
        return this.prisma.chats.update({ where: { id: chatId }, data: { updated_at: new Date() }, select: { id: true } });
    }
}
