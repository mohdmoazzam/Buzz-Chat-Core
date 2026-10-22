import { SEARCH_MAX } from "../../common/constants";
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { isUniqueViolation } from "../../common/errors";
import { directChatKey, isValidId } from "../../common/utils/ids";
import { CursorPagination, type CursorPaginationOptions } from "../../common/utils/pagination";
import { personFilter, readSearch } from "../../common/utils/search";
import { PrismaService } from "../../core/prisma.service";
import { RealtimeService } from "../../core/realtime.service";
import type { Prisma } from "../../../prisma/generated/client";
import { NEW_REQUEST, REFETCH_CHATS } from "../../socket/events";
import { ChatAccess } from "../chat/chat.access";
import { NotificationService } from "../notification/notification.service";
import { fullName } from "../user/user.names";
import { AVATAR_SELECT, NAME_SELECT, PERSON_SELECT } from "../user/user.serializer";

// "name" sorts by first name, then last name
const USER_SEARCH_PAGINATION = {
    orderFields: { name: ["first_name", "last_name"], username: ["username"], created_at: ["created_at"] },
    defaultOrderBy: "name",
    defaultOrder: "asc",
    defaultTake: 20,
    maxTake: 50,
} satisfies CursorPaginationOptions<"name" | "username" | "created_at", "first_name" | "last_name" | "username" | "created_at">;

type Relationship = "friend" | "sent" | "received";

@Injectable()
export class FriendService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly access: ChatAccess,
        private readonly realtime: RealtimeService,
        private readonly notifications: NotificationService,
    ) {}

    /**
     * People search (everyone except the current user), with how each person relates to them:
     * "friend" (plus their chatId), "sent" / "received" for pending requests, or null.
     * Query: ?search=text&cursor=&take=20&order_by=name&order=asc. Includes the total ("12 results").
     */
    async searchUsers(me: string, query: Record<string, unknown>) {
        const page = CursorPagination.parse(query, USER_SEARCH_PAGINATION);
        const search = readSearch(query.search, SEARCH_MAX);

        const where: Prisma.usersWhereInput = { id: { not: me }, ...(search ? personFilter(search) : {}) };

        const [rows, total] = await Promise.all([
            this.prisma.users.findMany({
                where,
                orderBy: page.orderBy,
                ...page.args((id) => ({ id })),
                select: { ...PERSON_SELECT, username: true },
            }),
            this.prisma.users.count({ where }),
        ]);
        const { rows: users, pagination } = page.result(rows, (user) => user.id, { total });

        // Relationship lookups only for the people on this page
        const { relationship, chatIdByFriend } = await this.relationshipsWith(
            me,
            users.map((user) => user.id),
        );

        return {
            data: users.map((user) => ({
                ...user,
                request_status: relationship.get(user.id) ?? null,
                chat_id: chatIdByFriend.get(user.id) ?? null,
            })),
            pagination,
        };
    }

    /**
     * Someone's public profile (no email or phone), how they relate to the viewer, and the groups
     * they share. Anyone signed in can view anyone, like people search.
     */
    async getProfile(me: string, userId: unknown) {
        if (!isValidId(userId)) throw new NotFoundException("User not found");
        const user = await this.prisma.users.findUnique({
            where: { id: userId },
            select: { ...PERSON_SELECT, username: true, bio: true, created_at: true, cover: AVATAR_SELECT },
        });
        if (!user) throw new NotFoundException("User not found");
        if (user.id === me) return { profile: user, request_status: "self" as const, chat_id: null, common_groups: [] };

        const [{ relationship, chatIdByFriend }, commonGroups] = await Promise.all([
            this.relationshipsWith(me, [user.id]),
            this.prisma.chats.findMany({
                where: {
                    group_chat: true,
                    AND: [{ members: { some: { user_id: me } } }, { members: { some: { user_id: user.id } } }],
                },
                orderBy: { updated_at: "desc" },
                select: { id: true, name: true },
            }),
        ]);
        return {
            profile: user,
            request_status: relationship.get(user.id) ?? null,
            chat_id: chatIdByFriend.get(user.id) ?? null,
            common_groups: commonGroups,
        };
    }

    /**
     * How each person relates to `me`: "friend" (with the 1:1 chat id), "sent" / "received" for a
     * pending request, or absent. Used by search and profiles.
     */
    private async relationshipsWith(me: string, ids: string[]) {
        const relationship = new Map<string, Relationship>();
        const chatIdByFriend = new Map<string, string>();
        if (!ids.length) return { relationship, chatIdByFriend };

        const [pendingRequests, friendChats] = await Promise.all([
            this.prisma.friend_requests.findMany({
                where: {
                    OR: [
                        { sender_id: me, receiver_id: { in: ids } },
                        { receiver_id: me, sender_id: { in: ids } },
                    ],
                },
                select: { sender_id: true, receiver_id: true },
            }),
            this.prisma.chats.findMany({
                where: { direct_key: { in: ids.map((id) => directChatKey(me, id)) } },
                select: { id: true, direct_key: true },
            }),
        ]);

        // "sent" = I already requested them, "received" = they requested me
        pendingRequests.forEach(({ sender_id, receiver_id }) => {
            if (sender_id === me) relationship.set(receiver_id, "sent");
            else relationship.set(sender_id, "received");
        });
        // An existing 1:1 chat means they're already friends (takes precedence)
        friendChats.forEach(({ id, direct_key }) => {
            const other = direct_key?.split(":").find((userId) => userId !== me);
            if (!other) return;
            relationship.set(other, "friend");
            chatIdByFriend.set(other, id);
        });
        return { relationship, chatIdByFriend };
    }

    async sendRequest(me: string, userId: string): Promise<void> {
        if (userId === me) {
            throw new BadRequestException("You can't send a request to yourself");
        }

        const [target, existingRequest, existingChat] = await Promise.all([
            this.prisma.users.findUnique({
                where: { id: userId },
                select: { id: true },
            }),
            this.prisma.friend_requests.findFirst({
                where: {
                    OR: [
                        { sender_id: me, receiver_id: userId },
                        { sender_id: userId, receiver_id: me },
                    ],
                },
                select: { id: true },
            }),
            this.prisma.chats.findUnique({
                where: { direct_key: directChatKey(me, userId) },
                select: { id: true },
            }),
        ]);

        if (!target) throw new NotFoundException("User not found");
        if (existingChat) throw new ConflictException("You're already friends");
        if (existingRequest) throw new ConflictException("Request already sent");

        try {
            await this.prisma.friend_requests.create({
                data: {
                    sender_id: me,
                    receiver_id: userId,
                },
            });
        } catch (error) {
            if (isUniqueViolation(error)) throw new ConflictException("Request already sent");
            throw error;
        }

        this.realtime.emitToUsers([userId], NEW_REQUEST);
    }

    /** Accepts or declines a request addressed to the current user. Returns the sender's id. */
    async respondToRequest(me: string, requestId: unknown, accept: boolean): Promise<string | null> {
        if (!isValidId(requestId)) {
            throw new BadRequestException("Invalid request");
        }

        const friendRequest = await this.prisma.friend_requests.findUnique({
            where: { id: requestId },
            include: {
                sender: { select: NAME_SELECT },
                receiver: { select: NAME_SELECT },
            },
        });

        // Only the receiver may respond; everyone else gets the same "not found"
        if (!friendRequest || friendRequest.receiver_id !== me) {
            throw new NotFoundException("Request not found");
        }

        if (!accept) {
            await this.prisma.friend_requests.delete({
                where: { id: friendRequest.id },
            });
            return null;
        }

        const { sender, receiver } = friendRequest;
        const members = [sender.id, receiver.id];
        const directKey = directChatKey(sender.id, receiver.id);
        const [chat] = await this.prisma.$transaction([
            this.prisma.chats.upsert({
                where: { direct_key: directKey },
                update: {},
                create: {
                    name: `${fullName(sender)}-${fullName(receiver)}`,
                    direct_key: directKey,
                    creator_id: sender.id,
                    members: {
                        create: members.map((user_id) => ({ user_id })),
                    },
                },
                select: { id: true },
            }),
            this.prisma.friend_requests.deleteMany({
                where: {
                    OR: [
                        { sender_id: sender.id, receiver_id: receiver.id },
                        { sender_id: receiver.id, receiver_id: sender.id },
                    ],
                },
            }),
        ]);

        this.realtime.emitToUsers(members, REFETCH_CHATS);
        this.notifications.queueInBackground("friend_request_accepted", { to: sender.id, data: { chat_id: chat.id }, actorId: me });

        return sender.id;
    }

    /** Pending friend requests sent to the current user. */
    async getPendingRequests(me: string) {
        return this.prisma.friend_requests.findMany({
            where: { receiver_id: me },
            orderBy: { created_at: "desc" },
            include: { sender: { select: PERSON_SELECT } },
        });
    }

    /** Friends, optionally excluding those already in `chatId` (for "add members"). */
    async getFriends(me: string, chatId: unknown) {
        const rows = await this.prisma.chat_members.findMany({
            where: {
                user_id: { not: me },
                chat: {
                    group_chat: false,
                    members: {
                        some: { user_id: me },
                    },
                },
            },
            select: {
                user: { select: PERSON_SELECT },
            },
        });
        const friends = rows.map(({ user }) => user);

        if (!chatId) return friends;
        if (!isValidId(chatId)) {
            throw new BadRequestException("Invalid chat");
        }

        const chat = await this.access.loadForMember(chatId, me);
        if (!chat) {
            throw new NotFoundException("Chat not found");
        }
        const inChat = new Set(chat.members.map((member) => member.user_id));
        return friends.filter((friend) => !inChat.has(friend.id));
    }
}
