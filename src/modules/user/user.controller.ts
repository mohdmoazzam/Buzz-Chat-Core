import { Body, Controller, Get, Put, Query } from "@nestjs/common";
import { ApiQuery, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuthenticatedController } from "../../common/base.controller";
import { BIO_MAX, GENDERS, NAME_MAX } from "../../common/constants";
import type { AuthUser } from "./user.serializer";
import { UserService, type UpdateProfileBody } from "./user.service";

// auth, user and friend share the /user prefix to keep existing client URLs
@ApiTags("Users")
@Controller("user")
export class UserController extends AuthenticatedController {
    constructor(private readonly users: UserService) {
        super();
    }

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
    @ApiQuery({ name: "username", required: true })
    async checkUsername(@CurrentUser() user: AuthUser, @Query("username") username: unknown) {
        return { success: true, ...(await this.users.checkUsername(user.id, username)) };
    }
}
