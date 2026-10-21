import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiQuery, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuthenticatedController } from "../../common/base.controller";
import type { AuthUser } from "../user/user.serializer";
import { MessageService } from "./message.service";

// Chat history and attachments, nested under each chat
@ApiTags("Messages")
@Controller("chat/:id/messages")
export class MessageController extends AuthenticatedController {
    constructor(private readonly messages: MessageService) {
        super();
    }

    // JSON body: { attachment_ids } — files are uploaded first with POST /assets
    @Post()
    @HttpCode(200)
    async sendAttachments(
        @CurrentUser() user: AuthUser,
        @Param("id") chatId: string,
        @Body("attachment_ids") attachmentIds: unknown,
    ) {
        const message = await this.messages.sendAttachments(user, chatId, attachmentIds);
        return { success: true, message };
    }

    @Get()
    @ApiQuery({ name: "page", required: false, type: Number })
    async getMessages(@CurrentUser() user: AuthUser, @Param("id") id: string, @Query("page") page?: string) {
        return { success: true, ...(await this.messages.getMessages(user.id, id, page)) };
    }

    // JSON body: { content }
    @Patch(":messageId")
    async editMessage(
        @CurrentUser() user: AuthUser,
        @Param("id") chatId: string,
        @Param("messageId") messageId: string,
        @Body("content") content: unknown,
    ) {
        const message = await this.messages.editMessage(user.id, chatId, messageId, content);
        return { success: true, message };
    }

    // Deletes for everyone
    @Delete(":messageId")
    async deleteMessage(@CurrentUser() user: AuthUser, @Param("id") chatId: string, @Param("messageId") messageId: string) {
        const message = await this.messages.deleteForEveryone(user.id, chatId, messageId);
        return { success: true, message };
    }

    // JSON body: { chat_ids }
    @Post(":messageId/forward")
    @HttpCode(200)
    async forwardMessage(
        @CurrentUser() user: AuthUser,
        @Param("id") chatId: string,
        @Param("messageId") messageId: string,
        @Body("chat_ids") chatIds: unknown,
    ) {
        const count = await this.messages.forwardMessage(user, chatId, messageId, chatIds);
        return { success: true, message: count === 1 ? "Message forwarded" : `Message forwarded to ${count} chats` };
    }
}
