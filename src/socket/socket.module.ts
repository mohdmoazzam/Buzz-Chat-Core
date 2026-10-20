import { Module } from "@nestjs/common";
import { ChatModule } from "../modules/chat/chat.module";
import { MessageModule } from "../modules/message/message.module";
import { ChatGateway } from "./chat.gateway";
import { PresenceService } from "./presence.service";

@Module({
    imports: [ChatModule, MessageModule],
    providers: [ChatGateway, PresenceService],
})
export class SocketModule {}
