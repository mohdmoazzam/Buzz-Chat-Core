import { Body, Controller, HttpCode, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { TRY_LATER } from "../../common/constants";
import { clearAuthCookie, setAuthCookie } from "../../common/cookies";
import { OptionalJwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RateLimit } from "../../common/guards/rate-limit.guard";
import { SessionService } from "../../core/session.service";
import { TokenService } from "../../core/token.service";
import type { AuthUser } from "../user/user.serializer";
import { ForgotPasswordDto, GoogleSignInDto, LoginDto, RegisterDto, ResetPasswordDto } from "./auth.dto";
import { AuthService } from "./auth.service";
import { GoogleAuthService } from "./google-auth.service";
import { PasswordResetService } from "./password-reset.service";

@ApiTags("Auth")
@Controller("user")
export class AuthController {
    constructor(
        private readonly auth: AuthService,
        private readonly tokens: TokenService,
        private readonly sessions: SessionService,
        private readonly passwordReset: PasswordResetService,
        private readonly google: GoogleAuthService,
    ) {}

    @Post("register")
    @RateLimit(10, 60, "Too many accounts created. Please try again later.")
    async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
        const user = await this.auth.register(dto);
        const message = user.email_verified_at ? "Account created" : `Account created. Enter the code we sent to ${user.email}.`;
        return this.startSession(req, res, user, message);
    }

    @Post("login")
    @HttpCode(200)
    @RateLimit(20, 15, TRY_LATER)
    async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
        const user = await this.auth.login(dto, req);
        return this.startSession(req, res, user, `Welcome back, ${user.first_name}`);
    }

    // Log in or sign up with a Google ID token (Google Identity Services)
    @Post("google")
    @HttpCode(200)
    @RateLimit(20, 15, TRY_LATER)
    async googleSignIn(@Body() dto: GoogleSignInDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
        const { user, created } = await this.google.signIn(dto.credential);
        return this.startSession(req, res, user, created ? "Account created" : `Welcome back, ${user.first_name}`);
    }

    @Post("forgot-password")
    @HttpCode(200)
    @RateLimit(5, 15, TRY_LATER)
    async forgotPassword(@Body() dto: ForgotPasswordDto) {
        await this.passwordReset.requestReset(dto);
        return { success: true, message: "If an account uses that email, a reset code is on its way" };
    }

    @Post("reset-password")
    @HttpCode(200)
    @RateLimit(10, 15, TRY_LATER)
    async resetPassword(@Body() dto: ResetPasswordDto) {
        await this.passwordReset.resetPassword(dto);
        return { success: true, message: "Password updated and all devices logged out. You can log in now." };
    }

    // POST, so another site can't log people out with an <img src>. Works without a valid
    // session too, so a client can always clear its cookie.
    @Post("logout")
    @HttpCode(200)
    @UseGuards(OptionalJwtAuthGuard)
    async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
        if (req.user && req.sessionId) await this.sessions.revoke(req.user.id, req.sessionId);
        clearAuthCookie(res);
        return { success: true, message: "Logged out successfully" };
    }

    /** Records the device as a new session, issues its token (cookie + body) and returns the user. */
    private async startSession(req: Request, res: Response, user: AuthUser, message: string) {
        const sessionId = await this.sessions.create(user.id, req);
        const token = this.tokens.signUser(user.id, sessionId);
        setAuthCookie(res, token);
        return {
            success: true,
            message,
            access_token: token,
            user,
        };
    }
}
