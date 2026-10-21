import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { hash } from "bcrypt";
import { randomBytes, randomInt, randomUUID } from "crypto";
import { OAuth2Client, type TokenPayload } from "google-auth-library";
import { BCRYPT_ROUNDS, NAME_MAX } from "../../common/constants";
import { isUniqueViolation } from "../../common/errors";
import { config } from "../../config/env";
import { PrismaService } from "../../core/prisma.service";
import { StorageService } from "../../core/storage.service";
import { NotificationService } from "../notification/notification.service";
import { USER_VIEW, type AuthUser } from "../user/user.serializer";

type GoogleProfile = Required<Pick<TokenPayload, "sub" | "email">> & Pick<TokenPayload, "given_name" | "family_name" | "name" | "picture">;

// Usernames are 3–20 of [a-zA-Z0-9_.]; leave room for a numeric suffix when the base is taken
const USERNAME_BASE_MAX = 15;
const USERNAME_ATTEMPTS = 5;

/** "Ravi.Kumar+test@gmail.com" -> "ravi.kumar"; padded when too short to be a username. */
const usernameBase = (email: string): string => {
    const base = email
        .split("@")[0]
        .toLowerCase()
        .replace(/[^a-z0-9_.]/g, "")
        .slice(0, USERNAME_BASE_MAX);
    return base.length >= 3 ? base : `${base}user`.slice(0, USERNAME_BASE_MAX);
};

/**
 * Sign in with Google. The client gets an ID token from Google Identity Services; it's verified here
 * (signature, audience = our client id, expiry) and matched to an account: by Google id, then by
 * email (linking Google to that account), otherwise a new account is created.
 */
@Injectable()
export class GoogleAuthService {
    private readonly logger = new Logger(GoogleAuthService.name);
    private readonly client = new OAuth2Client();

    constructor(
        private readonly prisma: PrismaService,
        private readonly storage: StorageService,
        private readonly notifications: NotificationService,
    ) {}

    get isConfigured(): boolean {
        return Boolean(config.googleClientId);
    }

    /** The signed-in (or newly created) user, and whether the account was just created. */
    async signIn(credential: string): Promise<{ user: AuthUser; created: boolean }> {
        const profile = await this.verify(credential);

        const byGoogle = await this.prisma.users.findUnique({ where: { google_id: profile.sub }, ...USER_VIEW });
        if (byGoogle) return { user: byGoogle, created: false };

        // Google has verified the email, so an account with it is this person's: link Google to it
        const byEmail = await this.prisma.users.findUnique({
            where: { email: profile.email },
            select: { id: true, email_verified_at: true },
        });
        if (byEmail) {
            const user = await this.prisma.users.update({
                where: { id: byEmail.id },
                data: { google_id: profile.sub, email_verified_at: byEmail.email_verified_at ?? new Date() },
                ...USER_VIEW,
            });
            return { user, created: false };
        }

        return { user: await this.createUser(profile), created: true };
    }

    private async verify(credential: string): Promise<GoogleProfile> {
        if (!this.isConfigured) {
            throw new HttpException("Sign in with Google is not available right now", HttpStatus.SERVICE_UNAVAILABLE);
        }
        let payload: TokenPayload | undefined;
        try {
            const ticket = await this.client.verifyIdToken({ idToken: credential, audience: config.googleClientId });
            payload = ticket.getPayload();
        } catch (error) {
            this.logger.warn(`Rejected a Google ID token: ${(error as Error)?.message ?? error}`);
            throw new UnauthorizedException("Google sign-in failed. Please try again.");
        }
        if (!payload?.sub || !payload.email) throw new UnauthorizedException("Google sign-in failed. Please try again.");
        // Only a verified email may log in to (or link with) an account that has that email
        if (!payload.email_verified) throw new BadRequestException("Your Google account's email isn't verified");
        return payload as GoogleProfile;
    }

    private async createUser(profile: GoogleProfile): Promise<AuthUser> {
        const avatarId = await this.createAvatar(profile);
        // Google users log in with Google; this random password can't be guessed (Forgot password sets a real one)
        const password = await hash(randomBytes(32).toString("hex"), BCRYPT_ROUNDS);
        const firstName = (profile.given_name || profile.name || profile.email.split("@")[0]).slice(0, NAME_MAX);
        const base = usernameBase(profile.email);

        for (let attempt = 0; attempt < USERNAME_ATTEMPTS; attempt++) {
            const username = attempt === 0 ? base : `${base}${randomInt(10, 100_000)}`;
            if (await this.prisma.users.findUnique({ where: { username }, select: { id: true } })) continue;
            try {
                const user = await this.prisma.users.create({
                    data: {
                        email: profile.email,
                        google_id: profile.sub,
                        first_name: firstName,
                        last_name: (profile.family_name ?? "").slice(0, NAME_MAX),
                        bio: "",
                        username,
                        password,
                        avatar_id: avatarId,
                        email_verified_at: new Date(),
                    },
                    ...USER_VIEW,
                });
                await this.prisma.assets.update({ where: { id: avatarId }, data: { uploaded_by: user.id } });
                // Best effort: the account exists either way
                this.notifications.queueNotification("welcome", { to: user.id, data: {} }).catch(() => undefined);
                return user;
            } catch (error) {
                // Someone took the username in the meantime: try another; anything else is a real error
                if (!isUniqueViolation(error)) throw error;
            }
        }
        throw new HttpException("Couldn't create your account. Please try again.", HttpStatus.CONFLICT);
    }

    /**
     * The profile photo: Google's picture copied into our storage. If that's not possible (no picture,
     * storage down) the asset points at Google's picture or a generated initials image instead.
     */
    private async createAvatar(profile: GoogleProfile): Promise<string> {
        const fallbackUrl =
            profile.picture ??
            `https://ui-avatars.com/api/?background=ea7070&color=fff&size=256&name=${encodeURIComponent(profile.name ?? profile.email)}`;
        let file: { public_id: string; url: string } = { public_id: `external:${randomUUID()}`, url: fallbackUrl };
        if (profile.picture && this.storage.isConfigured) {
            // A larger version than Google's default 96px
            file = await this.storage.uploadFromUrl(profile.picture.replace(/=s\d+-c$/, "=s400-c")).catch(() => file);
        }
        const asset = await this.prisma.assets.create({
            data: {
                public_id: file.public_id,
                url: file.url,
                resource_type: "image",
                mime_type: "image/jpeg",
                size_bytes: 0,
                original_name: "google-profile-photo",
                uploaded_by: null,
            },
            select: { id: true },
        });
        return asset.id;
    }
}
