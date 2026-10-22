import { Body, Controller, HttpCode, Post, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { AuthenticatedController } from "../../common/base.controller";
import { TRY_LATER } from "../../common/constants";
import { clearAuthCookie } from "../../common/cookies";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RateLimit } from "../../common/guards/rate-limit.guard";
import type { AuthUser } from "../user/user.serializer";
import { AccountDeletionService } from "./account-deletion.service";
import { VerifyEmailDto } from "./auth.dto";

/** Delete my account: a code is emailed first, then entering it deletes the account for good. */
@ApiTags("Auth")
@Controller("user/delete-account")
export class AccountDeletionController extends AuthenticatedController {
    constructor(private readonly deletion: AccountDeletionService) {
        super();
    }

    @Post("code")
    @HttpCode(200)
    @RateLimit(5, 15, TRY_LATER)
    async sendCode(@CurrentUser() user: AuthUser) {
        await this.deletion.sendCode(user.id);
        return { success: true, message: `We sent a code to ${user.email}` };
    }

    // { otp }: the same 6-digit shape as email verification
    @Post()
    @HttpCode(200)
    @RateLimit(10, 15, TRY_LATER)
    async deleteAccount(@CurrentUser() user: AuthUser, @Body() dto: VerifyEmailDto, @Res({ passthrough: true }) res: Response) {
        await this.deletion.deleteAccount(user.id, dto.otp);
        clearAuthCookie(res);
        return { success: true, message: "Your account has been deleted" };
    }
}
