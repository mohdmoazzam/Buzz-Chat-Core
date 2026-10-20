import type { SortOrder } from "mongoose";
import { ErrorHandler } from "../errors.js";

export type SortDirection = "asc" | "desc";

export interface PaginationOptions<Field extends string> {
    /** Fields the client may sort by (never pass user input straight to the DB). */
    allowedOrderBy: readonly Field[];
    defaultOrderBy: Field;
    defaultOrder?: SortDirection;
    defaultTake?: number;
    maxTake?: number;
}

export interface Pagination<Field extends string> {
    page: number;
    take: number;
    skip: number;
    orderBy: Field;
    order: SortDirection;
    /** Ready for .sort(); includes _id as a tie-breaker so pages never overlap. */
    sort: Record<string, SortOrder>;
}

export interface PaginationMeta {
    page: number;
    take: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
}

const parsePositiveInt = (value: unknown, name: string, fallback: number): number => {
    if (value === undefined || value === "") return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
        throw new ErrorHandler(`"${name}" must be a whole number of at least 1`, 400);
    }
    return parsed;
};

const readString = (value: unknown): string | undefined =>
    typeof value === "string" && value.trim() ? value.trim() : undefined;

/**
 * Parses ?page=&take=&orderBy=&order= into a validated pagination object.
 * Invalid values are rejected with a 400 that explains what is allowed.
 */
export const parsePagination = <Field extends string>(
    query: Record<string, unknown>,
    { allowedOrderBy, defaultOrderBy, defaultOrder = "desc", defaultTake = 20, maxTake = 100 }: PaginationOptions<Field>
): Pagination<Field> => {
    const page = parsePositiveInt(query.page, "page", 1);
    const take = parsePositiveInt(query.take, "take", defaultTake);
    if (take > maxTake) {
        throw new ErrorHandler(`"take" can be at most ${maxTake}`, 400);
    }

    const orderBy = readString(query.orderBy) ?? defaultOrderBy;
    if (!allowedOrderBy.includes(orderBy as Field)) {
        throw new ErrorHandler(`Invalid "orderBy". Use one of: ${allowedOrderBy.join(", ")}`, 400);
    }

    const order = (readString(query.order)?.toLowerCase() ?? defaultOrder) as SortDirection;
    if (order !== "asc" && order !== "desc") {
        throw new ErrorHandler(`Invalid "order". Use "asc" or "desc"`, 400);
    }

    const direction: SortOrder = order === "asc" ? 1 : -1;
    return {
        page,
        take,
        skip: (page - 1) * take,
        orderBy: orderBy as Field,
        order,
        sort: { [orderBy]: direction, _id: direction },
    };
};

export const paginationMeta = (page: number, take: number, total: number): PaginationMeta => {
    const totalPages = Math.ceil(total / take);
    return { page, take, total, totalPages, hasMore: page < totalPages };
};
