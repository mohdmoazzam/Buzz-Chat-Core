import { BadRequestException } from "@nestjs/common";

export type SortDirection = "asc" | "desc";

type OrderBy<Column extends string> = Partial<Record<Column | "id", SortDirection>>;

export interface PaginationOptions<Field extends string, Column extends string> {
    /**
     * Fields the client may sort by, mapped to the columns they sort on
     * (never pass user input straight to the DB).
     */
    orderFields: Record<Field, readonly Column[]>;
    defaultOrderBy: Field;
    defaultOrder?: SortDirection;
    defaultTake?: number;
    maxTake?: number;
}

export interface Pagination<Column extends string> {
    page: number;
    take: number;
    skip: number;
    order: SortDirection;
    /** Ready for Prisma's orderBy; includes id as a tie-breaker so pages never overlap. */
    orderBy: OrderBy<Column>[];
}

export interface PaginationMeta {
    page: number;
    take: number;
    total: number;
    total_pages: number;
    has_more: boolean;
}

const parsePositiveInt = (value: unknown, name: string, fallback: number): number => {
    if (value === undefined || value === "") return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
        throw new BadRequestException(`"${name}" must be a whole number of at least 1`);
    }
    return parsed;
};

const readString = (value: unknown): string | undefined => (typeof value === "string" && value.trim() ? value.trim() : undefined);

/**
 * Parses ?page=&take=&order_by=&order= into a validated pagination object.
 * Invalid values are rejected with a 400 that explains what is allowed.
 */
export const parsePagination = <Field extends string, Column extends string>(
    query: Record<string, unknown>,
    { orderFields, defaultOrderBy, defaultOrder = "desc", defaultTake = 20, maxTake = 100 }: PaginationOptions<Field, Column>,
): Pagination<Column> => {
    const page = parsePositiveInt(query.page, "page", 1);
    const take = parsePositiveInt(query.take, "take", defaultTake);
    if (take > maxTake) {
        throw new BadRequestException(`"take" can be at most ${maxTake}`);
    }

    const allowed = Object.keys(orderFields) as Field[];
    const orderBy = (readString(query.order_by) ?? defaultOrderBy) as Field;
    if (!allowed.includes(orderBy)) {
        throw new BadRequestException(`Invalid "order_by". Use one of: ${allowed.join(", ")}`);
    }

    const order = (readString(query.order)?.toLowerCase() ?? defaultOrder) as SortDirection;
    if (order !== "asc" && order !== "desc") {
        throw new BadRequestException(`Invalid "order". Use "asc" or "desc"`);
    }

    return {
        page,
        take,
        skip: (page - 1) * take,
        order,
        orderBy: [...orderFields[orderBy].map((column) => ({ [column]: order }) as OrderBy<Column>), { id: order } as OrderBy<Column>],
    };
};

export const paginationMeta = (page: number, take: number, total: number): PaginationMeta => {
    const total_pages = Math.ceil(total / take);
    return { page, take, total, total_pages, has_more: page < total_pages };
};
