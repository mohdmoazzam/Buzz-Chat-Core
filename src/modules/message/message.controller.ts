import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
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
}
