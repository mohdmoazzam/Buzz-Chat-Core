import { BadRequestException, HttpException, HttpStatus, Injectable, type OnModuleInit } from "@nestjs/common";
import { compare, hash } from "bcrypt";
import { BCRYPT_ROUNDS } from "../../common/constants";
import { createOtp, OTP_COOLDOWN, OTP_INVALID, OTP_TTL_MINUTES, otpOnCooldown, otpUnusable, wrongOtpMessage } from "../../common/utils/otp";
import { MailService } from "../../core/mail.service";
import { PrismaService } from "../../core/prisma.service";
import { SessionService } from "../../core/session.service";
import { NotificationService } from "../notification/notification.service";
import type { ForgotPasswordDto, ResetPasswordDto } from "./auth.dto";

/** Forgot password: emails a one-time code, then swaps the password when the code matches. */
@Injectable()
export class PasswordResetService implements OnModuleInit {
    // Compared against when there's no pending code, so timing doesn't reveal it
    private dummyHash = "";

    constructor(
        private readonly prisma: PrismaService,
        private readonly mail: MailService,
        private readonly sessions: SessionService,
        private readonly notifications: NotificationService,
    ) {}

    async onModuleInit(): Promise<void> {
        this.dummyHash = await hash("000000", BCRYPT_ROUNDS);
    }

    /** Silently does nothing for unknown emails, so the response doesn't reveal who has an account. */
    async requestReset(dto: ForgotPasswordDto): Promise<void> {
        if (!this.mail.isConfigured) {
            throw new HttpException("Password reset is not available right now", HttpStatus.SERVICE_UNAVAILABLE);
        }
        const user = await this.prisma.users.findUnique({
            where: { email: dto.email },
            select: { id: true, email: true, first_name: true, password_reset: { select: { created_at: true } } },
        });
        if (!user) return;

        if (otpOnCooldown(user.password_reset?.created_at)) {
            throw new HttpException(OTP_COOLDOWN, HttpStatus.TOO_MANY_REQUESTS);
        }

        const { code, row } = await createOtp();
        // A new code replaces any earlier one
        await this.prisma.password_resets.upsert({
            where: { user_id: user.id },
            create: { user_id: user.id, ...row },
            update: row,
        });

        try {
            await this.notifications.queueNotification("password_reset", {
                to: user.id,
                data: { code, minutes: OTP_TTL_MINUTES },
            });
        } catch (error) {
            // Never queued, so let them retry straight away
            await this.prisma.password_resets.delete({ where: { user_id: user.id } }).catch(() => undefined);
            throw error;
        }
    }

    async resetPassword(dto: ResetPasswordDto): Promise<void> {
        const user = await this.prisma.users.findUnique({
            where: { email: dto.email },
            select: { id: true, password_reset: true },
        });
        const reset = user?.password_reset;
        // Always run bcrypt so timing doesn't reveal whether a code is pending
        const codeOk = await compare(dto.otp, reset?.code_hash ?? this.dummyHash);

        if (!user || !reset || otpUnusable(reset)) {
            throw new BadRequestException(OTP_INVALID);
        }
        if (!codeOk) {
            const { attempts } = await this.prisma.password_resets.update({
                where: { user_id: user.id },
                data: { attempts: { increment: 1 } },
            });
            throw new BadRequestException(wrongOtpMessage(attempts));
        }

        const password = await hash(dto.password, BCRYPT_ROUNDS);
        await this.prisma.$transaction([
            this.prisma.users.update({ where: { id: user.id }, data: { password } }),
            this.prisma.password_resets.delete({ where: { user_id: user.id } }),
        ]);
        // Whoever knew the old password is logged out too
        await this.sessions.revokeAll(user.id);
    }
}
