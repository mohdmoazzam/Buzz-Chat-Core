import { Module } from "@nestjs/common";
import { ChatModule } from "../chat/chat.module";
import { MessageController } from "./message.controller";
import { MessageService } from "./message.service";

@Module({
    imports: [ChatModule],
    controllers: [MessageController],
    providers: [MessageService],
    exports: [MessageService],
})
export class MessageModule {}
