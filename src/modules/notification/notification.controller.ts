import { Controller, Delete, Get, Param, Patch, Query } from "@nestjs/common";
import { ApiQuery, ApiTags } from "@nestjs/swagger";
import { AuthenticatedController } from "../../common/base.controller";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { PaginationQuery } from "../../common/swagger";
import type { AuthUser } from "../user/user.serializer";
import { NotificationInboxService } from "./notification-inbox.service";

@ApiTags("Notifications")
@Controller("notifications")
export class NotificationController extends AuthenticatedController {
    constructor(private readonly inbox: NotificationInboxService) {
        super();
    }

    @Get()
    @PaginationQuery(["created_at"])
    @ApiQuery({ name: "unread", required: false, description: "true: only unread notifications" })
    async list(@CurrentUser() user: AuthUser, @Query() query: Record<string, unknown>) {
        return { success: true, ...(await this.inbox.list(user.id, query)) };
    }

    @Get("unread-count")
    async unreadCount(@CurrentUser() user: AuthUser) {
        return { success: true, unread_count: await this.inbox.unreadCount(user.id) };
    }

    // Declared before :id/read so "read-all" isn't taken for an id
    @Patch("read-all")
    async markAllRead(@CurrentUser() user: AuthUser) {
        const updated = await this.inbox.markAllRead(user.id);
        return { success: true, message: "All notifications marked as read", updated };
    }

    @Patch(":id/read")
    async markRead(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        await this.inbox.markRead(user.id, id);
        return { success: true, message: "Notification marked as read" };
    }

    @Delete(":id")
    async remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        await this.inbox.remove(user.id, id);
        return { success: true, message: "Notification deleted" };
    }
}
