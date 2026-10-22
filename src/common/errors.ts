import { Prisma } from "../../prisma/generated/client";

/** A unique index rejected the write (e.g. a username taken between check and save). */
export const isUniqueViolation = (error: unknown): boolean =>
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/** A foreign key rejected the write (e.g. the referenced row was deleted in the meantime). */
export const isForeignKeyViolation = (error: unknown): boolean =>
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";

/** A thrown value's message, for logs (anything can be thrown, not only Errors). */
export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));
