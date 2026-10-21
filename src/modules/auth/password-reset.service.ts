import { BadRequestException, HttpException, HttpStatus, Injectable, type OnModuleInit } from "@nestjs/common";
import { compare, hash } from "bcrypt";
import { randomInt } from "crypto";
import { BCRYPT_ROUNDS, RESET_OTP_MAX_ATTEMPTS, RESET_OTP_RESEND_COOLDOWN_MS, RESET_OTP_TTL_MS } from "../../common/constants";
import { MailService } from "../../core/mail.service";
import { PrismaService } from "../../core/prisma.service";
import { NotificationService } from "../notification/notification.service";
import type { ForgotPasswordDto, ResetPasswordDto } from "./auth.dto";

const INVALID_CODE = "This code is invalid or has expired. Please request a new one.";

/** Forgot password: emails a one-time code, then swaps the password when the code matches. */
@Injectable()
export class PasswordResetService implements OnModuleInit {
    // Compared against when there's no pending code, so timing doesn't reveal it
    private dummyHash = "";

    constructor(
        private readonly prisma: PrismaService,
        private readonly mail: MailService,
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

        const lastSent = user.password_reset?.created_at.getTime() ?? 0;
        if (Date.now() - lastSent < RESET_OTP_RESEND_COOLDOWN_MS) {
            throw new HttpException("Please wait a minute before requesting another code", HttpStatus.TOO_MANY_REQUESTS);
        }

        const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
        const reset = {
            code_hash: await hash(code, BCRYPT_ROUNDS),
            attempts: 0,
            expires_at: new Date(Date.now() + RESET_OTP_TTL_MS),
            created_at: new Date(),
        };
        // A new code replaces any earlier one
        await this.prisma.password_resets.upsert({
            where: { user_id: user.id },
            create: { user_id: user.id, ...reset },
            update: reset,
        });

        try {
            await this.notifications.email(user.email, "password-reset", {
                firstName: user.first_name,
                code,
                minutes: RESET_OTP_TTL_MS / 60_000,
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

        if (!user || !reset || reset.expires_at.getTime() < Date.now() || reset.attempts >= RESET_OTP_MAX_ATTEMPTS) {
            throw new BadRequestException(INVALID_CODE);
        }
        if (!codeOk) {
            const { attempts } = await this.prisma.password_resets.update({
                where: { user_id: user.id },
                data: { attempts: { increment: 1 } },
            });
            const left = RESET_OTP_MAX_ATTEMPTS - attempts;
            throw new BadRequestException(left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} left.` : INVALID_CODE);
        }

        const password = await hash(dto.password, BCRYPT_ROUNDS);
        await this.prisma.$transaction([
            this.prisma.users.update({ where: { id: user.id }, data: { password } }),
            this.prisma.password_resets.delete({ where: { user_id: user.id } }),
        ]);
    }
}
