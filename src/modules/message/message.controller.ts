import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import type { AuthUser } from "../user/user.serializer";
import { MessageService } from "./message.service";

// Chat history and attachments, under the chat routes
@Controller("chat/message")
@UseGuards(JwtAuthGuard)
export class MessageController {
    constructor(private readonly messages: MessageService) {}

    // JSON body: { chat_id, attachment_ids } — files are uploaded first with POST /assets
    @Post()
    @HttpCode(200)
    async sendAttachments(
        @CurrentUser() user: AuthUser,
        @Body("chat_id") chatId: unknown,
        @Body("attachment_ids") attachmentIds: unknown,
    ) {
        const message = await this.messages.sendAttachments(user, chatId, attachmentIds);
        return { success: true, message };
    }

    @Get(":id")
    async getMessages(@CurrentUser() user: AuthUser, @Param("id") id: string, @Query("page") page?: string) {
        return { success: true, ...(await this.messages.getMessages(user.id, id, page)) };
    }
}
