import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiQuery, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuthenticatedController } from "../../common/base.controller";
import type { AuthUser } from "../user/user.serializer";
import { EditMessageDto, ForwardMessageDto, SendAttachmentsDto } from "./message.dto";
import { MessageService } from "./message.service";

@ApiTags("Messages")
@Controller("chat/:chatId/messages")
export class MessageController extends AuthenticatedController {
    constructor(private readonly messages: MessageService) {
        super();
    }

    @Post()
    @HttpCode(200)
    async sendAttachments(@CurrentUser() user: AuthUser, @Param("chatId") chatId: string, @Body() dto: SendAttachmentsDto) {
        const message = await this.messages.sendAttachments(user, chatId, dto.attachment_ids);
        return { success: true, message };
    }

    @Get()
    @ApiQuery({ name: "page", required: false, type: Number })
    async getMessages(@CurrentUser() user: AuthUser, @Param("chatId") chatId: string, @Query("page") page?: string) {
        return { success: true, ...(await this.messages.getMessages(user.id, chatId, page)) };
    }

    @Patch(":messageId")
    async editMessage(
        @CurrentUser() user: AuthUser,
        @Param("chatId") chatId: string,
        @Param("messageId") messageId: string,
        @Body() dto: EditMessageDto,
    ) {
        const message = await this.messages.editMessage(user.id, chatId, messageId, dto.content);
        return { success: true, message };
    }

    @Delete(":messageId")
    async deleteMessage(@CurrentUser() user: AuthUser, @Param("chatId") chatId: string, @Param("messageId") messageId: string) {
        const message = await this.messages.deleteForEveryone(user.id, chatId, messageId);
        return { success: true, message };
    }

    @Post(":messageId/forward")
    @HttpCode(200)
    async forwardMessage(
        @CurrentUser() user: AuthUser,
        @Param("chatId") chatId: string,
        @Param("messageId") messageId: string,
        @Body() dto: ForwardMessageDto,
    ) {
        const count = await this.messages.forwardMessage(user, chatId, messageId, dto.chat_ids);
        return { success: true, message: count === 1 ? "Message forwarded" : `Message forwarded to ${count} chats` };
    }
}
