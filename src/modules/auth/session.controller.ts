import { Controller, Delete, Get, NotFoundException, Param, Res } from "@nestjs/common";
import { ApiParam, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { AuthenticatedController } from "../../common/base.controller";
import { clearAuthCookie } from "../../common/cookies";
import { CurrentSession } from "../../common/decorators/current-session.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { SessionService } from "../../core/session.service";
import type { AuthUser } from "../user/user.serializer";

/** The devices the user is logged in on, and logging them out. */
@ApiTags("Auth")
@Controller("user/sessions")
export class SessionController extends AuthenticatedController {
    constructor(private readonly sessions: SessionService) {
        super();
    }

    @Get()
    async list(@CurrentUser() user: AuthUser, @CurrentSession() sessionId: string) {
        const sessions = await this.sessions.list(user.id);
        return {
            success: true,
            sessions: sessions.map((session) => ({ ...session, current: session.id === sessionId })),
        };
    }

    // Log out everywhere, this device included
    @Delete()
    async revokeAll(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
        await this.sessions.revokeAll(user.id);
        clearAuthCookie(res);
        return { success: true, message: "Logged out of all devices" };
    }

    // Must stay before ":id"
    @Delete("others")
    async revokeOthers(@CurrentUser() user: AuthUser, @CurrentSession() sessionId: string) {
        const count = await this.sessions.revokeAll(user.id, sessionId);
        return {
            success: true,
            message: count ? `Logged out of ${count} other device${count === 1 ? "" : "s"}` : "No other devices are logged in",
        };
    }

    @Delete(":id")
    @ApiParam({ name: "id", format: "uuid" })
    async revoke(
        @CurrentUser() user: AuthUser,
        @CurrentSession() sessionId: string,
        @Param("id") id: string,
        @Res({ passthrough: true }) res: Response,
    ) {
        if (!(await this.sessions.revoke(user.id, id))) throw new NotFoundException("Device not found");
        if (id === sessionId) clearAuthCookie(res);
        return { success: true, message: "Device logged out" };
    }
}
