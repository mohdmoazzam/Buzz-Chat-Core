import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AuthenticatedController } from "../../common/base.controller";
import { TRY_LATER } from "../../common/constants";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AllowUnverified } from "../../common/guards/jwt-auth.guard";
import { RateLimit } from "../../common/guards/rate-limit.guard";
import type { AuthUser } from "../user/user.serializer";
import { VerifyEmailDto } from "./auth.dto";
import { EmailVerificationService } from "./email-verification.service";

/** Entering the code emailed at sign-up. The account is logged in but limited until then. */
@ApiTags("Auth")
@Controller("user/verify-email")
@AllowUnverified()
export class EmailVerificationController extends AuthenticatedController {
    constructor(private readonly verification: EmailVerificationService) {
        super();
    }

    @Post()
    @HttpCode(200)
    @RateLimit(10, 15, TRY_LATER)
    async verify(@CurrentUser() user: AuthUser, @Body() dto: VerifyEmailDto) {
        const verified = await this.verification.verify(user, dto.otp);
        return { success: true, message: "Email verified. Welcome to BuzzChat!", user: verified };
    }

    @Post("resend")
    @HttpCode(200)
    @RateLimit(5, 15, TRY_LATER)
    async resend(@CurrentUser() user: AuthUser) {
        if (user.email_verified_at) return { success: true, message: "Your email is already verified" };
        await this.verification.sendCode(user.id);
        return { success: true, message: `A new code is on its way to ${user.email}` };
    }
}
