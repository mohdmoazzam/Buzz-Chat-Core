import { Body, Controller, Put } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AuthenticatedController } from "../../common/base.controller";
import { TRY_LATER } from "../../common/constants";
import { CurrentSession } from "../../common/decorators/current-session.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RateLimit } from "../../common/guards/rate-limit.guard";
import type { AuthUser } from "../user/user.serializer";
import { ChangePasswordDto } from "./auth.dto";
import { AuthService } from "./auth.service";

/** Changing the password while logged in (forgot password is in AuthController, for logged-out users). */
@ApiTags("Auth")
@Controller("user/password")
export class PasswordController extends AuthenticatedController {
    constructor(private readonly auth: AuthService) {
        super();
    }

    // Guessing the current password is rate limited like logging in
    @Put()
    @RateLimit(10, 15, TRY_LATER)
    async change(@CurrentUser() user: AuthUser, @CurrentSession() sessionId: string, @Body() dto: ChangePasswordDto) {
        const loggedOut = await this.auth.changePassword(user.id, sessionId, dto);
        return {
            success: true,
            message: loggedOut
                ? `Password changed. ${loggedOut} other device${loggedOut === 1 ? " was" : "s were"} logged out.`
                : "Password changed",
            logged_out: loggedOut,
        };
    }
}
