import { hash } from "bcrypt";
import { randomInt } from "crypto";
import { BCRYPT_ROUNDS, OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_MS, OTP_TTL_MS } from "../constants";

// One-time codes for forgot password and email verification. Both store a row of the same
// shape (password_resets, email_verifications): only the bcrypt hash, never the code itself.

export const OTP_INVALID = "This code is invalid or has expired. Please request a new one.";
export const OTP_COOLDOWN = "Please wait a minute before requesting another code";

/** The code's lifetime in minutes, as shown in the email. */
export const OTP_TTL_MINUTES = OTP_TTL_MS / 60_000;

/** A fresh 6-digit code and the row fields that store it. */
export const createOtp = async () => {
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    return {
        code,
        row: {
            code_hash: await hash(code, BCRYPT_ROUNDS),
            attempts: 0,
            expires_at: new Date(Date.now() + OTP_TTL_MS),
            created_at: new Date(),
        },
    };
};

/** True while the last code is too recent for another one. */
export const otpOnCooldown = (sentAt: Date | undefined): boolean => Date.now() - (sentAt?.getTime() ?? 0) < OTP_RESEND_COOLDOWN_MS;

/** True when the code can no longer be used, however it's guessed. */
export const otpUnusable = (row: { expires_at: Date; attempts: number }): boolean =>
    row.expires_at.getTime() < Date.now() || row.attempts >= OTP_MAX_ATTEMPTS;

/** The error after a wrong guess, given the attempts made so far. */
export const wrongOtpMessage = (attempts: number): string => {
    const left = OTP_MAX_ATTEMPTS - attempts;
    return left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} left.` : OTP_INVALID;
};
