import { Body, Controller, Get, Put, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import type { AuthUser } from "./user.serializer";
import { UserService, type UpdateProfileBody } from "./user.service";

// auth, user and friend share the /user prefix to keep existing client URLs
@Controller("user")
@UseGuards(JwtAuthGuard)
export class UserController {
    constructor(private readonly users: UserService) {}

    // JwtAuthGuard already loaded the user for this request
    @Get("me")
    getProfile(@CurrentUser() user: AuthUser) {
        return { success: true, user };
    }

    // JSON body; a new photo is uploaded first with POST /assets and sent as avatar_id
    @Put("me")
    async updateProfile(@CurrentUser() user: AuthUser, @Body() body: UpdateProfileBody) {
        const updated = await this.users.updateProfile(user, body);
        return { success: true, message: "Profile updated", user: updated };
    }

    @Get("check-username")
    async checkUsername(@CurrentUser() user: AuthUser, @Query("username") username: unknown) {
        return { success: true, ...(await this.users.checkUsername(user.id, username)) };
    }
}
