import { Body, Controller, Get, HttpCode, Post, Res, UnauthorizedException, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { config } from "../../config/env";
import { ADMIN_COOKIE, cookieOptions, TRY_LATER } from "../../common/constants";
import { AdminGuard } from "../../common/guards/admin.guard";
import { RateLimit } from "../../common/guards/rate-limit.guard";
import { TokenService } from "../../core/token.service";
import { AdminService } from "./admin.service";

@Controller("admin")
export class AdminController {
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

    @Get()
    @UseGuards(AdminGuard)
    getAdminData() {
        return { admin: true };
    }

    @Get("users")
    @UseGuards(AdminGuard)
    async getAllUsers() {
        return { success: true, data: await this.admin.getAllUsers() };
    }

    @Get("chats")
    @UseGuards(AdminGuard)
    async getAllChats() {
        return { success: true, data: await this.admin.getAllChats() };
    }

    @Get("messages")
    @UseGuards(AdminGuard)
    async getAllMessages() {
        return { success: true, data: await this.admin.getAllMessages() };
    }

    @Get("stats")
    @UseGuards(AdminGuard)
    async getDashboardStats() {
        return { success: true, data: await this.admin.getDashboardStats() };
    }
}
