import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuthenticatedController } from "../../common/base.controller";
import { PaginationQuery } from "../../common/swagger";
import type { AuthUser } from "../user/user.serializer";
import { ChatService } from "./chat.service";
import { CreateGroupDto, type AddMembersBody, type UpdateGroupBody } from "./group.dto";
import { GroupService } from "./group.service";

@ApiTags("Chats")
@Controller("chat")
export class ChatController extends AuthenticatedController {
    constructor(
        private readonly chats: ChatService,
        private readonly groups: GroupService,
    ) {
        super();
    }

    @Get()
    @PaginationQuery(["updated_at", "created_at"])
    async getMyChats(@CurrentUser() user: AuthUser, @Query() query: Record<string, unknown>) {
        return { success: true, ...(await this.chats.getMyChats(user.id, query)) };
    }

    // Groups

    // JSON body; the picture is uploaded first with POST /assets and sent as avatar_id
    @Post("groups")
    async createGroup(@CurrentUser() user: AuthUser, @Body() dto: CreateGroupDto) {
        const chatId = await this.groups.createGroup(user.id, dto);
        return { success: true, message: "Group created", chat_id: chatId };
    }

    @Get("groups")
    async getMyGroups(@CurrentUser() user: AuthUser) {
        return { success: true, groups: await this.groups.getMyGroups(user.id) };
    }

    // Unread messages across all chats (tab title)
    @Get("unread-count")
    async unreadCount(@CurrentUser() user: AuthUser) {
        return { success: true, unread_count: await this.chats.totalUnread(user.id) };
    }

    // Must stay after the static paths above: "/:id" would otherwise match them

    // Same as the CHAT_READ socket event, for clients without a socket
    @Post(":id/read")
    async markRead(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        return { success: true, read_at: await this.chats.markRead(user.id, id) };
    }

    @Get(":id")
    @ApiQuery({ name: "populate", required: false, type: Boolean, description: "Include member profiles" })
    async getChatDetails(@CurrentUser() user: AuthUser, @Param("id") id: string, @Query("populate") populate?: string) {
        return { success: true, chat: await this.chats.getChatDetails(user.id, id, populate === "true") };
    }

    @Put(":id")
    async updateGroup(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: UpdateGroupBody) {
        const chat = await this.groups.updateGroup(user.id, id, body);
        return { success: true, message: "Group updated", chat };
    }

    @Delete(":id")
    async deleteChat(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        return { success: true, message: await this.chats.deleteChat(user.id, id) };
    }

    // Group members

    @Post(":id/members")
    async addMembers(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: AddMembersBody) {
        await this.groups.addMembers(user.id, id, body.members);
        return { success: true, message: "Members added successfully" };
    }

    // Must stay before ":id/members/:userId"
    @Delete(":id/members/me")
    async leaveGroup(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        await this.groups.leaveGroup(user.id, id);
        return { success: true, message: "You left the group" };
    }

    @Delete(":id/members/:userId")
    @ApiParam({ name: "userId", format: "uuid" })
    async removeMember(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("userId") userId: string) {
        await this.groups.removeMember(user.id, id, userId);
        return { success: true, message: "Member removed successfully" };
    }
}
