import { Module } from "@nestjs/common";
import { ChatModule } from "../chat/chat.module";
import { FriendController } from "./friend.controller";
import { FriendService } from "./friend.service";

@Module({
    imports: [ChatModule],
    controllers: [FriendController],
    providers: [FriendService],
})
export class FriendModule {}
