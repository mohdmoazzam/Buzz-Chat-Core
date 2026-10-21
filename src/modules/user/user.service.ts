import { ConflictException, Injectable } from "@nestjs/common";
import { USERNAME_REGEX, USERNAME_RULE_MESSAGE } from "../../common/constants";
import { isUniqueViolation } from "../../common/errors";
import { PrismaService } from "../../core/prisma.service";
import type { Prisma } from "../../../prisma/generated/client";
import { AssetsService } from "../assets/assets.service";
import type { UpdateProfileDto } from "./user.dto";
import { USER_VIEW, type AuthUser } from "./user.serializer";

@Injectable()
export class UserService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly assets: AssetsService,
    ) {}

    /** Usernames are citext, so "John" and "john" count as the same name. */
    async isUsernameTaken(username: string, excludeUserId?: string): Promise<boolean> {
        const user = await this.prisma.users.findFirst({
            where: { username, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
            select: { id: true },
        });
        return Boolean(user);
    }

    /** Emails are citext too, so case doesn't matter. */
    async isEmailTaken(email: string): Promise<boolean> {
        return Boolean(await this.prisma.users.findUnique({ where: { email }, select: { id: true } }));
    }

    async checkUsername(userId: string, rawUsername: unknown) {
        const username = String(rawUsername ?? "").trim();
        if (!USERNAME_REGEX.test(username)) {
            return { available: false, message: USERNAME_RULE_MESSAGE };
        }
        const taken = await this.isUsernameTaken(username, userId);
        return { available: !taken, message: taken ? "Username is already taken" : "Username is available" };
    }

    /** The DTO has already checked every field's format; this applies the ones that were sent. */
    async updateProfile(user: AuthUser, dto: UpdateProfileDto): Promise<AuthUser> {
        const { first_name, last_name, bio, username, gender, phone, avatar_id, cover_id } = dto;
        const data: Prisma.usersUncheckedUpdateInput = { first_name, last_name, bio };

        if (username !== undefined && username !== user.username) {
            if (await this.isUsernameTaken(username, user.id)) {
                throw new ConflictException("Username is already taken");
            }
            data.username = username;
        }
        // "" clears these optional fields
        if (gender !== undefined) data.gender = gender || null;
        if (phone !== undefined) data.phone = phone || null;

        const newAvatar = avatar_id !== undefined && avatar_id !== user.avatar_id;
        if (newAvatar) {
            await this.assets.assertUsable([avatar_id], user.id, { imagesOnly: true });
            data.avatar_id = avatar_id;
        }

        // null removes the cover; a new id replaces it
        const coverChanged = cover_id !== undefined && cover_id !== user.cover_id;
        if (coverChanged) {
            if (cover_id) await this.assets.assertUsable([cover_id], user.id, { imagesOnly: true });
            data.cover_id = cover_id;
        }

        try {
            const updated = await this.prisma.users.update({ where: { id: user.id }, data, ...USER_VIEW });
            // The old photo / cover is no longer used anywhere
            this.assets.removeInBackground([newAvatar ? user.avatar_id : null, coverChanged ? user.cover_id : null]);
            return updated;
        } catch (error) {
            // Unique index race: someone took the username between check and save
            if (isUniqueViolation(error)) {
                throw new ConflictException("Username is already taken");
            }
            throw error;
        }
    }
}
