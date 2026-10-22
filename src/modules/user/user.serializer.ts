import type { Prisma, users } from "../../../prisma/generated/client";

/** The parts of an asset needed to show an avatar or group picture. */
export const AVATAR_SELECT = { select: { id: true, url: true } } as const;

/** How a user is loaded for req.user and responses: no password hash, avatar and cover included. */
export const USER_VIEW = { omit: { password: true }, include: { avatar: AVATAR_SELECT, cover: AVATAR_SELECT } } as const;

/** A user without the password hash, with their avatar: what req.user holds and responses send. */
export type AuthUser = Prisma.usersGetPayload<typeof USER_VIEW>;

/** Drops the password hash from a user loaded with it (login). */
export const serializeUser = ({ password: _password, ...user }: users & Pick<AuthUser, "avatar" | "cover">): AuthUser => user;

/** Columns needed to name a person (message senders, alerts, notifications). */
export const NAME_SELECT = { id: true, first_name: true, last_name: true } as const;

/** A user loaded with NAME_SELECT. */
export type UserName = Prisma.usersGetPayload<{ select: typeof NAME_SELECT }>;

/** Columns needed to show a person in lists (name + avatar + last seen). */
export const PERSON_SELECT = { ...NAME_SELECT, last_seen_at: true, avatar: AVATAR_SELECT } as const;
