import { Types } from "mongoose";

export type Id = string | Types.ObjectId;

export const sameId = (a: unknown, b: unknown): boolean => String(a) === String(b);

export const isValidObjectId = (id: unknown): id is string =>
    (typeof id === "string" || id instanceof Types.ObjectId) && /^[a-f\d]{24}$/i.test(String(id));

export const areValidObjectIds = (ids: unknown): ids is string[] =>
    Array.isArray(ids) && ids.every(isValidObjectId);

/** Normalizes a single id or an array of ids into a de-duplicated string list. */
export const toIdList = (value: unknown): string[] =>
    [...new Set(([] as unknown[]).concat(value ?? []).map(String))];

/** The member who isn't `userId` (skips members deleted since, which populate as null). */
export const getOtherMember = <T extends { _id: Id } | null>(members: T[], userId: Id) =>
    members.find((member): member is NonNullable<T> => !!member && !sameId(member._id, userId));
