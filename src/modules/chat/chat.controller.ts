import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "../user/user.serializer";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { ChatService } from "./chat.service";
import { CreateGroupDto, type AddMembersBody, type RemoveMemberBody, type UpdateGroupBody } from "./group.dto";
import { GroupService } from "./group.service";

@Controller("chat")
@UseGuards(JwtAuthGuard)
export class ChatController {
    constructor(private readonly chats: ChatService, private readonly groups: GroupService) {}

    @Get("my")
    async getMyChats(@CurrentUser() user: AuthUser, @Query() query: Record<string, unknown>) {
        return { success: true, ...(await this.chats.getMyChats(user.id, query)) };
    }

    // Groups

    // JSON body; the picture is uploaded first with POST /assets and sent as avatar_id
    @Post("new")
    async createGroup(@CurrentUser() user: AuthUser, @Body() dto: CreateGroupDto) {
        const chatId = await this.groups.createGroup(user.id, dto);
        return { success: true, message: "Group created", chat_id: chatId };
    }

    @Get("my/groups")
    async getMyGroups(@CurrentUser() user: AuthUser) {
        return { success: true, groups: await this.groups.getMyGroups(user.id) };
    }

    @Put("addMembers")
    async addMembers(@CurrentUser() user: AuthUser, @Body() body: AddMembersBody) {
        await this.groups.addMembers(user.id, body);
        return { success: true, message: "Members added successfully" };
    }

    @Put("removeMember")
    async removeMember(@CurrentUser() user: AuthUser, @Body() body: RemoveMemberBody) {
        await this.groups.removeMember(user.id, body);
        return { success: true, message: "Member removed successfully" };
    }

    @Delete("leave/:id")
    async leaveGroup(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        await this.groups.leaveGroup(user.id, id);
        return { success: true, message: "You left the group" };
    }

    // Must stay last: "/:id" would otherwise match the paths above

    @Get(":id")
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
}
