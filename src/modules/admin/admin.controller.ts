import { Body, Controller, Get, HttpCode, Post, Res, UnauthorizedException } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { config } from "../../config/env";
import { AdminBaseController } from "../../common/base.controller";
import { ADMIN_COOKIE, cookieOptions, TRY_LATER } from "../../common/constants";
import { RateLimit } from "../../common/guards/rate-limit.guard";
import { TokenService } from "../../core/token.service";
import { AdminService } from "./admin.service";

// Public: obtaining and clearing the admin session
@ApiTags("Admin")
@Controller("admin")
export class AdminAuthController {
    constructor(private readonly admin: AdminService, private readonly tokens: TokenService) {}

    @Post("verify")
    @HttpCode(200)
    @RateLimit(10, 15, TRY_LATER)
    verify(@Body("secret_key") secretKey: unknown, @Res({ passthrough: true }) res: Response) {
        if (!this.admin.isAdminKey(secretKey)) {
            throw new UnauthorizedException("Invalid admin key");
        }
        const token = this.tokens.signAdmin();
        res.cookie(ADMIN_COOKIE, token, { ...cookieOptions, maxAge: config.adminTokenTtlSeconds * 1000 });
        return { success: true, admin_token: token, message: "Authenticated successfully" };
    }

    @Get("logout")
    logout(@Res({ passthrough: true }) res: Response) {
        res.cookie(ADMIN_COOKIE, "", { ...cookieOptions, maxAge: 0 });
        return { success: true, message: "Logged out successfully" };
    }
}

@ApiTags("Admin")
@Controller("admin")
export class AdminController extends AdminBaseController {
    constructor(private readonly admin: AdminService) {
        super();
    }

    @Get()
    getAdminData() {
        return { admin: true };
    }

    @Get("users")
    async getAllUsers() {
        return { success: true, data: await this.admin.getAllUsers() };
    }

    @Get("chats")
    async getAllChats() {
        return { success: true, data: await this.admin.getAllChats() };
    }

    @Get("messages")
    async getAllMessages() {
        return { success: true, data: await this.admin.getAllMessages() };
    }

    @Get("stats")
    async getDashboardStats() {
        return { success: true, data: await this.admin.getDashboardStats() };
    }
}
