import { Body, Controller, Delete, Get, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AuthenticatedController } from "../../common/base.controller";
import { CurrentSession } from "../../common/decorators/current-session.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "../user/user.serializer";
import { PushSubscriptionDto } from "./push.dto";
import { PushService } from "./push.service";

@ApiTags("Notifications")
@Controller("push")
export class PushController extends AuthenticatedController {
    constructor(private readonly push: PushService) {
        super();
    }

    // The VAPID public key the browser subscribes with; null when push is turned off on the server
    @Get("public-key")
    publicKey() {
        return { success: true, public_key: this.push.publicKey };
    }

    // This device's subscription; logging the device out removes it
    @Post("subscription")
    async subscribe(@CurrentUser() user: AuthUser, @CurrentSession() sessionId: string, @Body() dto: PushSubscriptionDto) {
        await this.push.subscribe(user.id, sessionId, dto);
        return { success: true, message: "Push notifications turned on" };
    }

    @Delete("subscription")
    async unsubscribe(@CurrentSession() sessionId: string) {
        await this.push.unsubscribe(sessionId);
        return { success: true, message: "Push notifications turned off" };
    }
}
