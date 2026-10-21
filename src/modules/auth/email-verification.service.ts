import { BadRequestException, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { compare } from "bcrypt";
import { createOtp, OTP_COOLDOWN, OTP_INVALID, OTP_TTL_MINUTES, otpOnCooldown, otpUnusable, wrongOtpMessage } from "../../common/utils/otp";
import { PrismaService } from "../../core/prisma.service";
import { NotificationService } from "../notification/notification.service";
import { USER_VIEW, type AuthUser } from "../user/user.serializer";

/**
 * Email verification on sign-up: a one-time code is emailed when the account is created, and
 * the account stays limited (JwtAuthGuard, socket handshake) until the code is entered.
 */
@Injectable()
export class EmailVerificationService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly notifications: NotificationService,
    ) {}

    /** Emails a new code, replacing any earlier one. Throws a 429 within a minute of the last code. */
    async sendCode(userId: string): Promise<void> {
        const pending = await this.prisma.email_verifications.findUnique({
            where: { user_id: userId },
            select: { created_at: true },
        });
        if (otpOnCooldown(pending?.created_at)) {
            throw new HttpException(OTP_COOLDOWN, HttpStatus.TOO_MANY_REQUESTS);
        }

        const { code, row } = await createOtp();
        await this.prisma.email_verifications.upsert({
            where: { user_id: userId },
            create: { user_id: userId, ...row },
            update: row,
        });

        try {
            await this.notifications.queueNotification("email_verification", {
                to: userId,
                data: { code, minutes: OTP_TTL_MINUTES },
            });
        } catch (error) {
            // Never queued, so let them retry straight away
            await this.prisma.email_verifications.delete({ where: { user_id: userId } }).catch(() => undefined);
            throw error;
        }
    }

    /** Marks the email verified when the code matches and returns the updated user. */
    async verify(user: AuthUser, otp: string): Promise<AuthUser> {
        if (user.email_verified_at) return user;

        const pending = await this.prisma.email_verifications.findUnique({ where: { user_id: user.id } });
        // Only the account owner can get here, so there's nothing to hide by timing
        if (!pending || otpUnusable(pending)) {
            throw new BadRequestException(OTP_INVALID);
        }
        if (!(await compare(otp, pending.code_hash))) {
            const { attempts } = await this.prisma.email_verifications.update({
                where: { user_id: user.id },
                data: { attempts: { increment: 1 } },
            });
            throw new BadRequestException(wrongOtpMessage(attempts));
        }

        const [verified] = await this.prisma.$transaction([
            this.prisma.users.update({
                where: { id: user.id },
                data: { email_verified_at: new Date() },
                ...USER_VIEW,
            }),
            this.prisma.email_verifications.delete({ where: { user_id: user.id } }),
        ]);

        // Verified either way; a welcome email that can't be queued isn't worth failing the request
        this.notifications.queueNotification("welcome", { to: user.id, data: {} }).catch(() => undefined);
        return verified;
    }
}
