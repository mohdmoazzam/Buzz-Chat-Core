import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "crypto";
import { GROUP_MAX_MEMBERS, INVITE_CODE_BYTES } from "../../common/constants";
import { PrismaService } from "../../core/prisma.service";
import { RealtimeService } from "../../core/realtime.service";
import { ALERT, REFETCH_CHATS } from "../../socket/events";
import { fullName } from "../user/user.names";
import { AVATAR_SELECT, NAME_SELECT } from "../user/user.serializer";
import { ChatAccess, groupAvatar, MEMBER_ORDER, memberIdsOf } from "./chat.access";

// base64url of INVITE_CODE_BYTES random bytes; anything else can't be a code, so skip the lookup
const INVITE_CODE_REGEX = /^[A-Za-z0-9_-]{22}$/;

const INVITE_SELECT = { code: true, expires_at: true, created_at: true } as const;

/**
 * Invite links: the admin shares a link, and anyone signed in who has it can join, even if
 * they aren't friends with the admin (unlike "Add members"). One link per group, which expires;
 * resetting it makes the old link stop working.
 */
@Injectable()
export class GroupInviteService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly access: ChatAccess,
        private readonly realtime: RealtimeService,
    ) {}

    /** The group's current link (admin only), or null when there is none or it has expired. */
    async getInvite(me: string, chatId: unknown) {
        const chat = await this.access.findForMember(chatId, me);
        this.access.assertGroupCreator(chat, me, "manage invite links");

        const invite = await this.prisma.group_invites.findUnique({ where: { chat_id: chat.id }, select: INVITE_SELECT });
        return invite && invite.expires_at > new Date() ? invite : null;
    }

    /** Creates the group's link, or replaces it with a new code (the old link stops working). */
    async createInvite(me: string, chatId: unknown, seconds: number) {
        const chat = await this.access.findForMember(chatId, me);
        this.access.assertGroupCreator(chat, me, "manage invite links");

        const row = {
            code: randomBytes(INVITE_CODE_BYTES).toString("base64url"),
            expires_at: new Date(Date.now() + seconds * 1000),
            created_at: new Date(),
        };
        return this.prisma.group_invites.upsert({
            where: { chat_id: chat.id },
            create: { chat_id: chat.id, ...row },
            update: row,
            select: INVITE_SELECT,
        });
    }

    async revokeInvite(me: string, chatId: unknown): Promise<void> {
        const chat = await this.access.findForMember(chatId, me);
        this.access.assertGroupCreator(chat, me, "manage invite links");
        await this.prisma.group_invites.deleteMany({ where: { chat_id: chat.id } });
    }

    /** What the join page shows before joining. */
    async previewInvite(me: string, code: unknown) {
        const invite = await this.findValidInvite(code);
        const chat = await this.prisma.chats.findUniqueOrThrow({
            where: { id: invite.chat_id },
            include: {
                avatar: AVATAR_SELECT,
                members: { orderBy: MEMBER_ORDER, take: 3, select: { user: { select: { avatar: AVATAR_SELECT } } } },
                _count: { select: { members: true } },
            },
        });
        const membership = await this.prisma.chat_members.findUnique({
            where: { chat_id_user_id: { chat_id: chat.id, user_id: me } },
            select: { user_id: true },
        });

        return {
            chat_id: chat.id,
            name: chat.name,
            description: chat.description,
            avatar: groupAvatar(
                chat,
                chat.members.map((member) => member.user.avatar.url),
            ),
            member_count: chat._count.members,
            is_member: !!membership,
            is_full: chat._count.members >= GROUP_MAX_MEMBERS,
            expires_at: invite.expires_at,
        };
    }

    /** Joins the group behind the link and returns its id (already a member: just the id). */
    async joinWithInvite(me: string, code: unknown): Promise<string> {
        const invite = await this.findValidInvite(code);
        const chat = await this.access.loadForMember(invite.chat_id, me);
        if (chat) return chat.id;

        const memberCount = await this.prisma.chat_members.count({ where: { chat_id: invite.chat_id } });
        if (memberCount >= GROUP_MAX_MEMBERS) {
            throw new BadRequestException(`This group is full (at most ${GROUP_MAX_MEMBERS} members)`);
        }

        // skipDuplicates: a double click can't add the same member twice
        const [, , user] = await this.prisma.$transaction([
            this.prisma.chat_members.createMany({ data: [{ chat_id: invite.chat_id, user_id: me }], skipDuplicates: true }),
            this.access.touch(invite.chat_id),
            this.prisma.users.findUnique({ where: { id: me }, select: NAME_SELECT }),
        ]);

        const joined = await this.access.findForMember(invite.chat_id, me);
        const memberIds = memberIdsOf(joined);
        this.realtime.emitToUsers(memberIds, ALERT, {
            chat_id: joined.id,
            message: `${user ? fullName(user) : "Someone"} joined using the invite link`,
        });
        this.realtime.emitToUsers(memberIds, REFETCH_CHATS);
        return joined.id;
    }

    /** 404 for unknown, reset and expired links alike. */
    private async findValidInvite(code: unknown) {
        const invite =
            typeof code === "string" && INVITE_CODE_REGEX.test(code)
                ? await this.prisma.group_invites.findUnique({ where: { code }, select: { chat_id: true, expires_at: true } })
                : null;
        if (!invite || invite.expires_at <= new Date()) {
            throw new NotFoundException("This invite link is invalid or has expired");
        }
        return invite;
    }
}
