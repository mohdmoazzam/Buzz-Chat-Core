import { Module } from "@nestjs/common";
import { ChatAccess } from "./chat.access";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";
import { GroupInviteService } from "./group-invite.service";
import { GroupService } from "./group.service";
import { ReadStateService } from "./read-state.service";

@Module({
    controllers: [ChatController],
    providers: [ChatAccess, ChatService, GroupService, GroupInviteService, ReadStateService],
    exports: [ChatAccess, ReadStateService],
})
export class ChatModule {}
