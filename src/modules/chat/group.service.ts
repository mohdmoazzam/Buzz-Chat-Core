import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { GROUP_MAX_MEMBERS, GROUP_MIN_MEMBERS } from "../../common/constants";
import { isValidId } from "../../common/utils/ids";
import { PrismaService } from "../../core/prisma.service";
import { RealtimeService } from "../../core/realtime.service";
import type { Prisma } from "../../../prisma/generated/client";
import { AssetsService } from "../assets/assets.service";
import { NotificationService } from "../notification/notification.service";
import { ALERT, REFETCH_CHATS } from "../../socket/events";
import { fullName } from "../user/user.names";
import { AVATAR_SELECT, NAME_SELECT } from "../user/user.serializer";
import { ChatAccess, groupAvatar, MEMBER_ORDER, memberIdsOf } from "./chat.access";
import type { CreateGroupDto, UpdateGroupDto } from "./group.dto";

@Injectable()
export class GroupService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly access: ChatAccess,
        private readonly assets: AssetsService,
        private readonly realtime: RealtimeService,
        private readonly notifications: NotificationService,
    ) {}

    async createGroup(me: string, dto: CreateGroupDto): Promise<string> {
        const { name, description = "" } = dto;
        // Never count the creator twice (the DTO already removed duplicates)
        const members = dto.members.filter((id) => id !== me);

        if (members.length + 1 < GROUP_MIN_MEMBERS) {
            throw new BadRequestException(`Group chat must have at least ${GROUP_MIN_MEMBERS} members`);
        }
        await this.assertCanAdd(me, members, members.length + 1);

        // Group picture, uploaded first via POST /assets
        if (dto.avatar_id) {
            await this.assets.assertUsable([dto.avatar_id], me, { imagesOnly: true });
        }

        const allMembers = [...members, me];
        const chat = await this.prisma.chats.create({
            data: {
                name,
                description,
                avatar_id: dto.avatar_id,
                group_chat: true,
                creator_id: me,
                members: { create: allMembers.map((user_id) => ({ user_id })) },
            },
            select: { id: true },
        });

        this.alert(allMembers, chat.id, `Welcome to ${name}`);
        this.realtime.emitToUsers(members, REFETCH_CHATS);
        await this.notifications.inApp(members, "group_added", { chat_id: chat.id, group_name: name }, me);
        return chat.id;
    }

    /** Groups the user created (and can manage). */
    async getMyGroups(me: string) {
        const chats = await this.prisma.chats.findMany({
            where: { group_chat: true, creator_id: me, members: { some: { user_id: me } } },
            orderBy: [{ updated_at: "desc" }, { id: "desc" }],
            include: {
                avatar: AVATAR_SELECT,
                members: { orderBy: MEMBER_ORDER, take: 3, select: { user: { select: { avatar: AVATAR_SELECT } } } },
                _count: { select: { members: true } },
            },
        });

        return chats.map((chat) => ({
            id: chat.id,
            name: chat.name,
            description: chat.description,
            group_chat: chat.group_chat,
            member_count: chat._count.members,
            avatar: groupAvatar(
                chat,
                chat.members.map((member) => member.user.avatar.url),
            ),
        }));
    }

    async addMembers(me: string, chatId: unknown, requested: string[]): Promise<void> {
        const chat = await this.access.findForMember(chatId, me);
        this.access.assertGroupCreator(chat, me, "add members");

        const current = memberIdsOf(chat);
        const newIds = requested.filter((id) => !current.includes(id));
        if (!newIds.length) {
            throw new BadRequestException("Everyone selected is already in the group");
        }
        await this.assertCanAdd(me, newIds, current.length + newIds.length);

        const newUsers = await this.prisma.users.findMany({ where: { id: { in: newIds } }, select: NAME_SELECT });
        if (newUsers.length !== newIds.length) {
            throw new BadRequestException("Some selected users no longer exist");
        }

        // skipDuplicates: concurrent requests can't add the same member twice
        await this.prisma.$transaction([
            this.prisma.chat_members.createMany({
                data: newIds.map((user_id) => ({ chat_id: chat.id, user_id })),
                skipDuplicates: true,
            }),
            this.access.touch(chat.id),
        ]);
        const memberIds = await this.memberIds(chat.id);

        const names = newUsers.map(fullName).join(", ");
        this.alert(memberIds, chat.id, `${names} ${newUsers.length > 1 ? "were" : "was"} added to the group`);
        this.realtime.emitToUsers(memberIds, REFETCH_CHATS);
        await this.notifications.inApp(newIds, "group_added", { chat_id: chat.id, group_name: chat.name }, me);
    }

    async removeMember(me: string, chatId: unknown, userId: unknown): Promise<void> {
        if (!isValidId(userId)) {
            throw new BadRequestException("Invalid user");
        }

        const chat = await this.access.findForMember(chatId, me);
        this.access.assertGroupCreator(chat, me, "remove members");

        const allMembersBefore = memberIdsOf(chat);
        if (userId === me) {
            throw new BadRequestException("Use “Leave group” to remove yourself");
        }
        if (!allMembersBefore.includes(userId)) {
            throw new NotFoundException("This user is not in the group");
        }
        if (allMembersBefore.length <= GROUP_MIN_MEMBERS) {
            throw new BadRequestException(`Group must have at least ${GROUP_MIN_MEMBERS} members`);
        }

        const [removedUser] = await this.prisma.$transaction([
            this.prisma.users.findUnique({ where: { id: userId }, select: NAME_SELECT }),
            this.prisma.chat_members.deleteMany({ where: { chat_id: chat.id, user_id: userId } }),
            this.access.touch(chat.id),
        ]);

        const remaining = allMembersBefore.filter((id) => id !== userId);
        this.alert(remaining, chat.id, `${removedUser ? fullName(removedUser) : "A member"} was removed from the group`);
        this.realtime.emitToUsers(allMembersBefore, REFETCH_CHATS);
    }

    async leaveGroup(me: string, chatId: unknown): Promise<void> {
        const chat = await this.access.findForMember(chatId, me);
        if (!chat.group_chat) {
            throw new BadRequestException("This is not a group chat");
        }

        const remaining = memberIdsOf(chat).filter((id) => id !== me);
        if (remaining.length < GROUP_MIN_MEMBERS) {
            throw new BadRequestException(`You can't leave: the group needs at least ${GROUP_MIN_MEMBERS} members. Delete it instead.`);
        }

        // Hand admin over to the longest-standing member
        const creatorId = chat.creator_id === me ? remaining[0] : chat.creator_id;
        const [user] = await this.prisma.$transaction([
            this.prisma.users.findUnique({ where: { id: me }, select: NAME_SELECT }),
            this.prisma.chat_members.deleteMany({ where: { chat_id: chat.id, user_id: me } }),
            this.prisma.chats.update({ where: { id: chat.id }, data: { creator_id: creatorId }, select: { id: true } }),
        ]);

        this.alert(remaining, chat.id, `${user ? fullName(user) : "A member"} left the group`);
        this.realtime.emitToUsers([...remaining, me], REFETCH_CHATS);
    }

    /** Updates a group's name, description and/or picture (admin only). */
    async updateGroup(me: string, chatId: unknown, dto: UpdateGroupDto) {
        const chat = await this.access.findForMember(chatId, me);
        this.access.assertGroupCreator(chat, me, "edit this group");

        // Fields left out of the request stay undefined, which Prisma leaves unchanged
        const data: Prisma.chatsUncheckedUpdateInput = { name: dto.name, description: dto.description };
        // New group picture, uploaded first via POST /assets
        const avatarId = dto.avatar_id;
        const newAvatar = avatarId !== undefined && avatarId !== chat.avatar_id;
        if (newAvatar) {
            await this.assets.assertUsable([avatarId], me, { imagesOnly: true });
            data.avatar_id = avatarId;
        }

        const updated = await this.prisma.chats.update({ where: { id: chat.id }, data, include: { avatar: AVATAR_SELECT } });
        // The old picture is no longer used anywhere
        if (newAvatar) this.assets.removeInBackground([chat.avatar_id]);

        this.realtime.emitToUsers(memberIdsOf(chat), REFETCH_CHATS);
        return updated;
    }

    /** Rules for adding people to a group: the size cap, and friends only (so groups can't be used to spam strangers). */
    private async assertCanAdd(me: string, newIds: string[], groupSizeAfter: number): Promise<void> {
        if (groupSizeAfter > GROUP_MAX_MEMBERS) {
            throw new BadRequestException(`A group can have at most ${GROUP_MAX_MEMBERS} members`);
        }
        const friendIds = await this.access.getFriendIds(me);
        if (!newIds.every((id) => friendIds.has(id))) {
            throw new ForbiddenException("You can only add your friends to a group");
        }
    }

    private async memberIds(chatId: string): Promise<string[]> {
        const rows = await this.prisma.chat_members.findMany({ where: { chat_id: chatId }, select: { user_id: true } });
        return rows.map((row) => row.user_id);
    }

    private alert(memberIds: string[], chatId: string, message: string): void {
        this.realtime.emitToUsers(memberIds, ALERT, { chat_id: chatId, message });
    }
}
