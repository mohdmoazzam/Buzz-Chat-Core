import type { gender } from "../../../prisma/generated/client";

// 3–20 characters: letters, numbers, underscore or dot
export const USERNAME_REGEX = /^[a-zA-Z0-9_.]{3,20}$/;
export const USERNAME_RULE_MESSAGE = "Username must be 3–20 characters: letters, numbers, _ or .";

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // bcrypt ignores bytes beyond 72

/** Max length of first_name and of last_name, each. */
export const NAME_MAX = 50;
export const BIO_MAX = 160;

export const GENDERS: readonly gender[] = ["male", "female", "other", "prefer_not_to_say"];

// Stored normalized: optional leading +, then 7–15 digits
export const PHONE_REGEX = /^\+?[0-9]{7,15}$/;
