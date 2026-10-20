import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { isUniqueViolation } from "../../common/errors";
import { isValidId } from "../../common/utils/ids";
import { PrismaService } from "../../core/prisma.service";
import type { gender, Prisma } from "../../../prisma/generated/client";
import { AssetsService } from "../assets/assets.service";
import { BIO_MAX, GENDERS, PHONE_REGEX, USERNAME_REGEX, USERNAME_RULE_MESSAGE } from "../../common/constants";
import { readNameFields } from "./user.names";
import { USER_VIEW, type AuthUser } from "./user.serializer";

export interface UpdateProfileBody {
    first_name?: unknown;
    last_name?: unknown;
    bio?: unknown;
    username?: unknown;
    gender?: unknown;
    phone?: unknown;
    /** New profile photo, uploaded first via POST /assets. */
    avatar_id?: unknown;
}

const asTrimmedString = (value: unknown): string | undefined =>
    typeof value === "string" ? value.trim() : undefined;

@Injectable()
export class UserService {
    constructor(private readonly prisma: PrismaService, private readonly assets: AssetsService) {}

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

    async updateProfile(user: AuthUser, body: UpdateProfileBody): Promise<AuthUser> {
        // Validate everything before touching the database
        const names = readNameFields(body);
        const bio = asTrimmedString(body.bio);
        const username = asTrimmedString(body.username);
        const genderValue = asTrimmedString(body.gender);
        const phone = asTrimmedString(body.phone);

        if (bio !== undefined && (!bio || bio.length > BIO_MAX)) {
            throw new BadRequestException(`Bio must be 1–${BIO_MAX} characters`);
        }
        if (genderValue && !GENDERS.includes(genderValue as gender)) {
            throw new BadRequestException("Invalid gender");
        }
        const normalizedPhone = phone?.replace(/[\s\-().]/g, "");
        if (normalizedPhone && !PHONE_REGEX.test(normalizedPhone)) {
            throw new BadRequestException("Enter a valid phone number (7–15 digits)");
        }

        const data: Prisma.usersUncheckedUpdateInput = { ...names };
        if (username !== undefined && username !== user.username) {
            if (!USERNAME_REGEX.test(username)) {
                throw new BadRequestException(USERNAME_RULE_MESSAGE);
            }
            if (await this.isUsernameTaken(username, user.id)) {
                throw new ConflictException("Username is already taken");
            }
            data.username = username;
        }
        if (bio !== undefined) data.bio = bio;
        if (genderValue !== undefined) data.gender = (genderValue || null) as gender | null;
        if (phone !== undefined) data.phone = normalizedPhone || null;

        const newAvatar = body.avatar_id !== undefined && body.avatar_id !== user.avatar_id;
        if (newAvatar) {
            if (!isValidId(body.avatar_id)) throw new BadRequestException("Invalid profile photo");
            await this.assets.assertUsable([body.avatar_id], user.id, { imagesOnly: true });
            data.avatar_id = body.avatar_id;
        }

        try {
            const updated = await this.prisma.users.update({ where: { id: user.id }, data, ...USER_VIEW });
            // The old photo is no longer used anywhere
            if (newAvatar) this.assets.removeInBackground([user.avatar_id]);
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
