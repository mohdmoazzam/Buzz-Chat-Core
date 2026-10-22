import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { hash } from "bcrypt";
import { BCRYPT_ROUNDS } from "../../common/constants";
import { MailService } from "../../core/mail.service";
import { PrismaService } from "../../core/prisma.service";
import { SessionService } from "../../core/session.service";
import type { ForgotPasswordDto, ResetPasswordDto } from "./auth.dto";
import { OtpService } from "./otp.service";

/** Forgot password: emails a one-time code, then swaps the password when the code matches. */
@Injectable()
export class PasswordResetService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly mail: MailService,
        private readonly sessions: SessionService,
        private readonly otp: OtpService,
    ) {}

    /** Silently does nothing for unknown emails, so the response doesn't reveal who has an account. */
    async requestReset(dto: ForgotPasswordDto): Promise<void> {
        if (!this.mail.isConfigured) {
            throw new HttpException("Password reset is not available right now", HttpStatus.SERVICE_UNAVAILABLE);
        }
        const user = await this.prisma.users.findUnique({ where: { email: dto.email }, select: { id: true } });
        if (!user) return;
        await this.otp.send("password_reset", user.id);
    }

    async resetPassword(dto: ResetPasswordDto): Promise<void> {
        const user = await this.prisma.users.findUnique({ where: { email: dto.email }, select: { id: true } });
        const userId = await this.otp.check("password_reset", user?.id ?? null, dto.otp);

        const password = await hash(dto.password, BCRYPT_ROUNDS);
        await this.prisma.$transaction([
            this.prisma.users.update({ where: { id: userId }, data: { password } }),
            this.otp.consume("password_reset", userId),
        ]);
        // Whoever knew the old password is logged out too
        await this.sessions.revokeAll(userId);
    }
}
