import { MEMBERS_PAGE_MAX, MEMBERS_PAGE_SIZE, SEARCH_MAX } from "../../common/constants";
import { Injectable, NotFoundException } from "@nestjs/common";
import { isValidId } from "../../common/utils/ids";
import { CursorPagination, type CursorPaginationOptions } from "../../common/utils/pagination";
import { containsText, personFilter, readSearch } from "../../common/utils/search";
import { PrismaService } from "../../core/prisma.service";
import { RealtimeService } from "../../core/realtime.service";
import type { Prisma } from "../../../prisma/generated/client";
import { AssetsService } from "../assets/assets.service";
import { ALERT, DISAPPEARING_UPDATED, REFETCH_CHATS } from "../../socket/events";
import { fullName } from "../user/user.names";
import { AVATAR_SELECT, NAME_SELECT, PERSON_SELECT } from "../user/user.serializer";
import { ChatAccess, groupAvatar, MEMBER_ORDER, memberIdsOf, type ChatWithMemberIds } from "./chat.access";
import { ReadStateService } from "./read-state.service";

interface LastMessagePreview {
    id: string;
    deleted_at: Date | null;
    content: string;
    attachments: { url: string }[];
    created_at: Date;
    sender: { id: string; first_name: string; last_name: string };
}

interface LastMessageRow {
    id: string;
    deleted_at: Date | null;
    chat_id: string;
    content: string;
    attachments: { url: string }[];
    created_at: Date;
    sender_id: string;
    first_name: string;
    last_name: string;
}

/** "24 hours", "7 days", "90 days" */
const disappearingLabel = (seconds: number) => {
    const days = seconds / (24 * 60 * 60);
    return days === 1 ? "24 hours" : `${days} days`;
};

const CHAT_LIST_PAGINATION = {
    orderFields: { updated_at: ["updated_at"], created_at: ["created_at"] },
    defaultOrderBy: "updated_at",
    defaultOrder: "desc",
    defaultTake: 20,
    maxTake: 100,
} satisfies CursorPaginationOptions<"updated_at" | "created_at", "updated_at" | "created_at">;

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
        private readonly readState: ReadStateService,
    ) {}

    /**
     * Chats the user is in, with a last-message preview.
     * Query: ?cursor=&take=20&order_by=updated_at&order=desc&search=text (updated_at = latest activity).
     */
    async getMyChats(me: string, query: Record<string, unknown>) {
        const page = CursorPagination.parse(query, CHAT_LIST_PAGINATION);
        const rows = await this.prisma.chats.findMany({
            where: this.chatListFilter(me, query.search),
            orderBy: page.orderBy,
            ...page.args((id) => ({ id })),
            include: {
                avatar: AVATAR_SELECT,
                members: {
                    orderBy: MEMBER_ORDER,
                    select: {
                        user: { select: PERSON_SELECT },
                    },
                },
            },
        });
        const { rows: chats, pagination } = page.result(rows, (chat) => chat.id);

        const chatIds = chats.map((chat) => chat.id);
        const [lastMessages, unread] = await Promise.all([this.getLastMessages(me, chatIds), this.readState.unreadCounts(me, chatIds)]);

        const transformedChats = chats.flatMap((chat) => {
            const members = chat.members.map((member) => member.user);
            const otherMember = members.find((member) => member.id !== me);

            if (!chat.group_chat && !otherMember) return [];
            return [
                {
                    id: chat.id,
                    name: chat.group_chat ? chat.name : otherMember && fullName(otherMember),
                    group_chat: chat.group_chat,
                    avatar: chat.group_chat
                        ? groupAvatar(
                              chat,
                              members.map((m) => m.avatar.url),
                          )
                        : [otherMember?.avatar.url],
                    members: members.filter((m) => m.id !== me).map((m) => m.id),
                    last_message: lastMessages.get(chat.id) ?? null,
                    unread_count: unread.get(chat.id) ?? 0,
                },
            ];
        });

        return { chats: transformedChats, pagination };
    }

    async markRead(me: string, chatId: unknown): Promise<Date | null> {
        const chat = await this.access.findForMember(chatId, me);
        return this.readState.markRead(chat.id, me, memberIdsOf(chat));
    }

    totalUnread(me: string): Promise<number> {
        return this.readState.totalUnread(me);
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

    /**
     * One page of a chat's members in join order (the order admin is handed over in).
     * Only checks the caller's own membership instead of loading every member first.
     */
    async getMembers(me: string, chatId: unknown, query: Record<string, unknown>) {
        const page = CursorPagination.parse(query, { defaultTake: MEMBERS_PAGE_SIZE, maxTake: MEMBERS_PAGE_MAX });
        const chat = isValidId(chatId)
            ? await this.prisma.chats.findFirst({
                  where: { id: chatId, members: { some: { user_id: me } } },
                  select: { id: true, creator_id: true, _count: { select: { members: true } } },
              })
            : null;
        if (!chat) throw new NotFoundException("Chat not found");

        const rows = await this.prisma.chat_members.findMany({
            where: { chat_id: chat.id },
            orderBy: MEMBER_ORDER,
            // The cursor is a member's user id; their row is unique per chat
            ...page.args((userId) => ({ chat_id_user_id: { chat_id: chat.id, user_id: userId } })),
            select: { joined_at: true, user: { select: { ...PERSON_SELECT, username: true } } },
        });

        const { rows: members, pagination } = page.result(rows, (row) => row.user.id, { total: chat._count.members });
        return {
            members: members.map(({ user, joined_at }) => ({ ...user, joined_at, is_admin: user.id === chat.creator_id })),
            pagination,
        };
    }

    /**
     * Turns disappearing messages on (with a timer) or off. Any member of a 1:1 chat can change it;
     * in a group, only the admin. It applies to messages sent from now on, like WhatsApp.
     */
    async setDisappearing(me: string, chatId: unknown, seconds: number | null) {
        const chat = await this.access.findForMember(chatId, me);
        if (chat.group_chat) this.access.assertGroupCreator(chat, me, "change disappearing messages");
        if (chat.disappearing_seconds === seconds) return { seconds };

        const [, actor] = await Promise.all([
            this.prisma.chats.update({ where: { id: chat.id }, data: { disappearing_seconds: seconds }, select: { id: true } }),
            this.prisma.users.findUnique({ where: { id: me }, select: NAME_SELECT }),
        ]);
        const memberIds = memberIdsOf(chat);
        const who = actor ? fullName(actor) : "Someone";
        this.realtime.emitToUsers(memberIds, ALERT, {
            chat_id: chat.id,
            message: seconds
                ? `${who} turned on disappearing messages (${disappearingLabel(seconds)})`
                : `${who} turned off disappearing messages`,
        });
        this.realtime.emitToUsers(memberIds, DISAPPEARING_UPDATED, { chat_id: chat.id, seconds });
        return { seconds };
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
    private async getLastMessages(me: string, chatIds: string[]): Promise<Map<string, LastMessagePreview>> {
        if (!chatIds.length) return new Map();
        const rows = await this.prisma.$queryRaw<LastMessageRow[]>`
            SELECT DISTINCT ON (m.chat_id)
                m.chat_id, m.id, m.content, m.deleted_at, m.created_at, u.id AS sender_id, u.first_name, u.last_name,
                -- Only the URLs are needed to describe the attachment type
                COALESCE((
                    SELECT json_agg(json_build_object('url', a.url) ORDER BY ma.position)
                    FROM message_attachments ma JOIN assets a ON a.id = ma.asset_id
                    WHERE ma.message_id = m.id
                ), '[]') AS attachments
            FROM messages m
            JOIN users u ON u.id = m.sender_id
            WHERE m.chat_id = ANY(${chatIds}::uuid[])
              -- Skip messages this user deleted for themselves
              AND NOT EXISTS (SELECT 1 FROM message_hidden h WHERE h.message_id = m.id AND h.user_id = ${me}::uuid)
            ORDER BY m.chat_id, m.created_at DESC`;

        return new Map(
            rows.map((row) => [
                row.chat_id,
                {
                    id: row.id,
                    content: row.content ?? "",
                    deleted_at: row.deleted_at,
                    attachments: row.attachments,
                    created_at: row.created_at,
                    sender: { id: row.sender_id, first_name: row.first_name, last_name: row.last_name },
                },
            ]),
        );
    }
}
