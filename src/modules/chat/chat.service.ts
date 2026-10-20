import { Injectable } from "@nestjs/common";
import { paginationMeta, parsePagination, type PaginationOptions } from "../../common/utils/pagination";
import { containsText, personFilter, readSearch } from "../../common/utils/search";
import { PrismaService } from "../../core/prisma.service";
import { RealtimeService } from "../../core/realtime.service";
import type { Prisma } from "../../../prisma/generated/client";
import { AssetsService } from "../assets/assets.service";
import { REFETCH_CHATS } from "../../socket/events";
import { fullName } from "../user/user.names";
import { AVATAR_SELECT, PERSON_SELECT } from "../user/user.serializer";
import { ChatAccess, groupAvatar, MEMBER_ORDER, memberIdsOf, type ChatWithMemberIds } from "./chat.access";

interface LastMessagePreview {
    content: string;
    attachments: { url: string }[];
    created_at: Date;
    sender: { id: string; first_name: string; last_name: string };
}

interface LastMessageRow {
    chat_id: string;
    content: string;
    attachments: { url: string }[];
    created_at: Date;
    sender_id: string;
    first_name: string;
    last_name: string;
}

const CHAT_LIST_PAGINATION = {
    orderFields: { updated_at: ["updated_at"], created_at: ["created_at"] },
    defaultOrderBy: "updated_at",
    defaultOrder: "desc",
    defaultTake: 20,
    maxTake: 100,
} satisfies PaginationOptions<"updated_at" | "created_at", "updated_at" | "created_at">;

const SEARCH_MAX = 50;

/** The chat row as stored, with `members` as a list of user ids. */
const serializeChat = ({ members: _members, ...chat }: ChatWithMemberIds, memberIds: string[]) => ({
    ...chat,
    members: memberIds,
});

@Injectable()
export class ChatService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly access: ChatAccess,
        private readonly assets: AssetsService,
        private readonly realtime: RealtimeService,
    ) {}

    /**
     * Chats the user is in, with a last-message preview.
     * Query: ?page=1&take=20&order_by=updated_at&order=desc&search=text (updated_at = latest activity).
     */
    async getMyChats(me: string, query: Record<string, unknown>) {
        const { page, take, skip, orderBy } = parsePagination(query, CHAT_LIST_PAGINATION);
        const where = this.chatListFilter(me, query.search);

        const [chats, total] = await Promise.all([
            this.prisma.chats.findMany({
                where,
                orderBy,
                skip,
                take,
                include: {
                    avatar: AVATAR_SELECT,
                    members: { orderBy: MEMBER_ORDER, select: { user: { select: PERSON_SELECT } } },
                },
            }),
            this.prisma.chats.count({ where }),
        ]);

        const lastMessages = await this.getLastMessages(chats.map((chat) => chat.id));

        const transformedChats = chats.flatMap((chat) => {
            const members = chat.members.map((member) => member.user);
            const otherMember = members.find((member) => member.id !== me);
            // A 1:1 chat whose other member was deleted has nothing to show
            if (!chat.group_chat && !otherMember) return [];
            return [{
                id: chat.id,
                // 1:1 chats are named after the other person
                name: chat.group_chat ? chat.name : otherMember && fullName(otherMember),
                group_chat: chat.group_chat,
                avatar: chat.group_chat ? groupAvatar(chat, members.map((m) => m.avatar.url)) : [otherMember?.avatar.url],
                members: members.filter((m) => m.id !== me).map((m) => m.id),
                last_message: lastMessages.get(chat.id) ?? null,
            }];
        });

        return { chats: transformedChats, pagination: paginationMeta(page, take, total) };
    }

    async getChatDetails(me: string, chatId: unknown, populate: boolean) {
        const chat = await this.access.findForMember(chatId, me);
        if (!populate) return serializeChat(chat, memberIdsOf(chat));

        const members = await this.prisma.chat_members.findMany({
            where: { chat_id: chat.id },
            orderBy: MEMBER_ORDER,
            select: { user: { select: { ...PERSON_SELECT, username: true } } },
        });
        return { ...serializeChat(chat, []), members: members.map(({ user }) => user) };
    }

    /** Deletes a 1:1 chat (any member) or a group (admin only), with its messages and files. */
    async deleteChat(me: string, chatId: unknown): Promise<string> {
        const chat = await this.access.findForMember(chatId, me);
        if (chat.group_chat) {
            this.access.assertGroupCreator(chat, me, "delete the group");
        }

        const attachments = await this.prisma.message_attachments.findMany({
            where: { message: { chat_id: chat.id } },
            select: { asset_id: true },
        });

        // Members, messages and attachment links go with it (ON DELETE CASCADE); then the files themselves
        await this.prisma.chats.delete({ where: { id: chat.id } });
        this.assets.removeInBackground([chat.avatar_id, ...attachments.map((attachment) => attachment.asset_id)]);

        this.realtime.emitToUsers(memberIdsOf(chat), REFETCH_CHATS);
        return chat.group_chat ? "Group deleted" : "Chat deleted";
    }

    /**
     * The user's chats, optionally narrowed by a search term:
     * groups match on their name, 1:1 chats match on the other person's name or username.
     */
    private chatListFilter(me: string, rawSearch: unknown): Prisma.chatsWhereInput {
        const mine: Prisma.chatsWhereInput = { members: { some: { user_id: me } } };
        const search = readSearch(rawSearch, SEARCH_MAX);
        if (!search) return mine;

        return {
            ...mine,
            OR: [
                { group_chat: true, name: containsText(search) },
                // The other member, so searching your own name doesn't match every chat
                { group_chat: false, members: { some: { user_id: { not: me }, user: personFilter(search) } } },
            ],
        };
    }

    /** Latest message per chat in one query (DISTINCT ON uses the {chat_id, created_at} index). */
    private async getLastMessages(chatIds: string[]): Promise<Map<string, LastMessagePreview>> {
        if (!chatIds.length) return new Map();
        const rows = await this.prisma.$queryRaw<LastMessageRow[]>`
            SELECT DISTINCT ON (m.chat_id)
                m.chat_id, m.content, m.created_at, u.id AS sender_id, u.first_name, u.last_name,
                -- Only the URLs are needed to describe the attachment type
                COALESCE((
                    SELECT json_agg(json_build_object('url', a.url) ORDER BY ma.position)
                    FROM message_attachments ma JOIN assets a ON a.id = ma.asset_id
                    WHERE ma.message_id = m.id
                ), '[]') AS attachments
            FROM messages m
            JOIN users u ON u.id = m.sender_id
            WHERE m.chat_id = ANY(${chatIds}::uuid[])
            ORDER BY m.chat_id, m.created_at DESC`;

        return new Map(rows.map((row) => [row.chat_id, {
            content: row.content ?? "",
            attachments: row.attachments,
            created_at: row.created_at,
            sender: { id: row.sender_id, first_name: row.first_name, last_name: row.last_name },
        }]));
    }
}
