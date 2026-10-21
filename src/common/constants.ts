import type { CookieOptions } from "express";
import { config } from "../config/env";
import type { gender } from "../../prisma/generated/client";

// Auth / session

export const AUTH_COOKIE = "buzzChat-token";
export const ADMIN_COOKIE = "buzzChat-admin-token";

export const cookieOptions: CookieOptions = {
    maxAge: config.tokenTtlSeconds * 1000,
    sameSite: "none",
    httpOnly: true,
    secure: true,
};

export const BCRYPT_ROUNDS = 10;

/** DEV_MASTER_PASSWORD must be at least this long to be enabled. */
export const DEV_MASTER_PASSWORD_MIN_LENGTH = 12;

// Uploads

export const UPLOAD_MAX_FILES = 5;
export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

// Users

// 3–20 characters: letters, numbers, underscore or dot
export const USERNAME_REGEX = /^[a-zA-Z0-9_.]{3,20}$/;
export const USERNAME_RULE_MESSAGE = "Username must be 3–20 characters: letters, numbers, _ or .";

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // bcrypt ignores bytes beyond 72
export const PASSWORD_RULE_MESSAGE = `Password must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters`;

/** Max length of first_name and of last_name, each. */
export const NAME_MAX = 50;
export const BIO_MAX = 160;

export const GENDERS: readonly gender[] = ["male", "female", "other", "prefer_not_to_say"];

// Stored normalized: optional leading +, then 7–15 digits
export const PHONE_REGEX = /^\+?[0-9]{7,15}$/;

// Chats / groups

export const GROUP_NAME_MAX = 50;
export const GROUP_DESCRIPTION_MAX = 200;
export const GROUP_MIN_MEMBERS = 3;
export const GROUP_MAX_MEMBERS = 15;

/** Max length of a search term (chat and user search). */
export const SEARCH_MAX = 50;

// Messages

export const MESSAGE_MAX = 4000;
export const MESSAGES_PAGE_SIZE = 20;
/** How long after sending the sender can still edit a message. */
export const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;
/** Max chats a message can be forwarded to at once. */
export const FORWARD_MAX_CHATS = 5;

// Error messages

export const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";
export const TRY_LATER = "Too many attempts. Please wait a few minutes and try again.";
export const RATE_LIMIT_DEFAULT_MESSAGE = "You're doing that too often. Please slow down.";
export const UPLOAD_RATE_LIMIT_MESSAGE = "Too many uploads. Please wait a few minutes and try again.";
