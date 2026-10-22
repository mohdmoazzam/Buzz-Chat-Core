import { BadRequestException, HttpException, HttpStatus, Injectable, type OnModuleInit } from "@nestjs/common";
import { compare, hash } from "bcrypt";
import { randomInt } from "crypto";
import { BCRYPT_ROUNDS, OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_MS, OTP_TTL_MS } from "../../common/constants";
import { PrismaService } from "../../core/prisma.service";
import type { Prisma } from "../../../prisma/generated/client";
import { NotificationService } from "../notification/notification.service";

/** What a one-time code confirms. Also the notification type that emails it. */
export type OtpPurpose = "email_verification" | "password_reset" | "account_deletion";

const OTP_INVALID = "This code is invalid or has expired. Please request a new one.";
const OTP_COOLDOWN = "Please wait a minute before requesting another code";
const OTP_TTL_MINUTES = OTP_TTL_MS / 60_000;

interface OtpRow {
    code_hash: string;
    attempts: number;
    expires_at: Date;
    created_at: Date;
}

// The three code tables (email_verifications, password_resets, account_deletions) have the same
// columns and are keyed by user_id; this is the part of their Prisma delegates used here.
interface OtpTable {
    findUnique(args: { where: { user_id: string } }): Promise<OtpRow | null>;
    upsert(args: { where: { user_id: string }; create: OtpRow & { user_id: string }; update: OtpRow }): Promise<unknown>;
    update(args: { where: { user_id: string }; data: { attempts: { increment: number } } }): Promise<OtpRow>;
    delete(args: { where: { user_id: string } }): Prisma.PrismaPromise<unknown>;
}

/**
 * 6-digit codes emailed to the user: email verification, forgot password and account deletion.
 * Only the bcrypt hash is stored, a code expires after OTP_TTL_MS and burns after OTP_MAX_ATTEMPTS
 * wrong guesses, and a new code replaces the previous one.
 */
@Injectable()
export class OtpService implements OnModuleInit {
    // Compared against when there's no pending code, so timing doesn't reveal it
    private dummyHash = "";

    constructor(
        private readonly prisma: PrismaService,
        private readonly notifications: NotificationService,
    ) {}

    async onModuleInit(): Promise<void> {
        this.dummyHash = await hash("000000", BCRYPT_ROUNDS);
    }

    /** Emails a new code, replacing any earlier one. 429 within a minute of the last code. */
    async send(purpose: OtpPurpose, userId: string): Promise<void> {
        const table = this.table(purpose);
        const pending = await table.findUnique({ where: { user_id: userId } });
        if (pending && Date.now() - pending.created_at.getTime() < OTP_RESEND_COOLDOWN_MS) {
            throw new HttpException(OTP_COOLDOWN, HttpStatus.TOO_MANY_REQUESTS);
        }

        const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
        const row: OtpRow = {
            code_hash: await hash(code, BCRYPT_ROUNDS),
            attempts: 0,
            expires_at: new Date(Date.now() + OTP_TTL_MS),
            created_at: new Date(),
        };
        await table.upsert({ where: { user_id: userId }, create: { user_id: userId, ...row }, update: row });

        try {
            await this.notifications.queueNotification(purpose, { to: userId, data: { code, minutes: OTP_TTL_MINUTES } });
        } catch (error) {
            // Never queued, so let them retry straight away
            await table.delete({ where: { user_id: userId } }).catch(() => undefined);
            throw error;
        }
    }

    /**
     * Throws a 400 unless `code` is the user's current code. A null user (e.g. an unknown email)
     * fails the same way and takes as long, so the response doesn't reveal who has an account.
     * Returns the user id. The code stays stored: delete it with `consume` together with the action it confirms.
     */
    async check(purpose: OtpPurpose, userId: string | null, code: string): Promise<string> {
        const table = this.table(purpose);
        const pending = userId ? await table.findUnique({ where: { user_id: userId } }) : null;
        // Always run bcrypt so timing doesn't reveal whether a code is pending
        const matches = await compare(code, pending?.code_hash ?? this.dummyHash);

        const usable = pending && pending.expires_at.getTime() >= Date.now() && pending.attempts < OTP_MAX_ATTEMPTS;
        if (!userId || !usable) throw new BadRequestException(OTP_INVALID);
        if (matches) return userId;

        const { attempts } = await table.update({ where: { user_id: userId }, data: { attempts: { increment: 1 } } });
        const left = OTP_MAX_ATTEMPTS - attempts;
        throw new BadRequestException(left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} left.` : OTP_INVALID);
    }

    /** Deletes the user's code; a query, so callers can run it in the same transaction as the action. */
    consume(purpose: OtpPurpose, userId: string): Prisma.PrismaPromise<unknown> {
        return this.table(purpose).delete({ where: { user_id: userId } });
    }

    private table(purpose: OtpPurpose): OtpTable {
        switch (purpose) {
            case "email_verification":
                return this.prisma.email_verifications as unknown as OtpTable;
            case "password_reset":
                return this.prisma.password_resets as unknown as OtpTable;
            case "account_deletion":
                return this.prisma.account_deletions as unknown as OtpTable;
        }
    }
}
