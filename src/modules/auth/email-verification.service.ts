import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../core/prisma.service";
import { NotificationService } from "../notification/notification.service";
import { USER_VIEW, type AuthUser } from "../user/user.serializer";
import { OtpService } from "./otp.service";

/**
 * Email verification on sign-up: a one-time code is emailed when the account is created, and
 * the account stays limited (JwtAuthGuard, socket handshake) until the code is entered.
 */
@Injectable()
export class EmailVerificationService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly otp: OtpService,
        private readonly notifications: NotificationService,
    ) {}

    /** Emails a new code, replacing any earlier one. Throws a 429 within a minute of the last code. */
    sendCode(userId: string): Promise<void> {
        return this.otp.send("email_verification", userId);
    }

    /** Marks the email verified when the code matches and returns the updated user. */
    async verify(user: AuthUser, code: string): Promise<AuthUser> {
        if (user.email_verified_at) return user;
        await this.otp.check("email_verification", user.id, code);

        const [verified] = await this.prisma.$transaction([
            this.prisma.users.update({
                where: { id: user.id },
                data: { email_verified_at: new Date() },
                ...USER_VIEW,
            }),
            this.otp.consume("email_verification", user.id),
        ]);

        this.notifications.queueInBackground("welcome", { to: user.id, data: {} });
        return verified;
    }
}
