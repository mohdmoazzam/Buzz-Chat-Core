import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { RateLimitGuard } from "./common/guards/rate-limit.guard";
import { CoreModule } from "./core/core.module";
import { HealthController } from "./health.controller";
import { AdminModule } from "./modules/admin/admin.module";
import { AssetsModule } from "./modules/assets/assets.module";
import { AuthModule } from "./modules/auth/auth.module";
import { ChatModule } from "./modules/chat/chat.module";
import { FriendModule } from "./modules/friend/friend.module";
import { MessageModule } from "./modules/message/message.module";
import { NotificationModule } from "./modules/notification/notification.module";
import { UserModule } from "./modules/user/user.module";
import { SocketModule } from "./socket/socket.module";

@Module({
    imports: [
        // General API ceiling per IP; stricter limits are set per route with @RateLimit
        ThrottlerModule.forRoot([{ ttl: 60 * 1000, limit: 300 }]),
        CoreModule,
        NotificationModule,
        AssetsModule,
        AuthModule,
        UserModule,
        FriendModule,
        MessageModule,
        ChatModule,
        AdminModule,
        SocketModule,
    ],
    controllers: [HealthController],
    providers: [{ provide: APP_GUARD, useClass: RateLimitGuard }],
})
export class AppModule {}
