import { Body, Controller, Get, HttpCode, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { AUTH_COOKIE, cookieOptions, TRY_LATER } from "../../common/constants";
import { RateLimit } from "../../common/guards/rate-limit.guard";
import { TokenService } from "../../core/token.service";
import type { AuthUser } from "../user/user.serializer";
import { LoginDto, RegisterDto } from "./auth.dto";
import { AuthService } from "./auth.service";

// Shares the /user prefix with the user and friend routes to keep the existing client URLs
@Controller("user")
export class AuthController {
    constructor(private readonly auth: AuthService, private readonly tokens: TokenService) {}

    // JSON body; the avatar is uploaded beforehand with POST /assets
    @Post("register")
    @RateLimit(10, 60, "Too many accounts created. Please try again later.")
    async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
        const user = await this.auth.register(dto);
        return this.startSession(res, user, "Account created");
    }

    @Post("login")
    @HttpCode(200)
    @RateLimit(20, 15, TRY_LATER)
    async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
        const user = await this.auth.login(dto, req);
        return this.startSession(res, user, `Welcome back, ${user.first_name}`);
    }

    // Logout must work even with an expired session
    @Get("logout")
    logout(@Res({ passthrough: true }) res: Response) {
        res.cookie(AUTH_COOKIE, "", { ...cookieOptions, maxAge: 0 });
        return { success: true, message: "Logged out successfully" };
    }

    /** Issues a session token (cookie + body) and returns the user. */
    private startSession(res: Response, user: AuthUser, message: string) {
        const token = this.tokens.signUser(user.id);
        res.cookie(AUTH_COOKIE, token, cookieOptions);
        return { success: true, message, access_token: token, user };
    }
}
