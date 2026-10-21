import { BadRequestException } from "@nestjs/common";
import { isValidId } from "./ids";

// Cursor ("keyset") pagination for every list API.
//
//   GET /chat?take=20                    first page
//   GET /chat?take=20&cursor=<next_cursor> the page right after it
//
// The cursor is the (opaque) id of the last row the client got. The next page is read with Prisma's
// native `cursor`, so the database compares against that row's stored values: exact even though
// timestamps have microseconds and a JS Date only milliseconds, for any sort order (names included),
// and fast deep into a list (no OFFSET scan). Rows added or removed in between never shift pages.
// If a list is re-sorted (a chat bumped by a new message), a page may repeat rows; clients de-duplicate by id.

export type SortDirection = "asc" | "desc";

type OrderBy<Column extends string> = Partial<Record<Column | "id", SortDirection>>;

export interface CursorPaginationOptions<Field extends string = never, Column extends string = never> {
    /**
     * Fields the client may sort by (?order_by=), mapped to the columns they sort on.
     * Never pass user input straight to the DB. Leave out for lists with a fixed order.
     */
    orderFields?: Record<Field, readonly Column[]>;
    defaultOrderBy?: Field;
    defaultOrder?: SortDirection;
    defaultTake?: number;
    maxTake?: number;
}

/** The pagination part of every list response. */
export interface CursorPageMeta {
    take: number;
    /** Pass back as ?cursor= for the next page; null on the last page. */
    next_cursor: string | null;
    has_more: boolean;
    /** Only on lists that show a count (e.g. "12 results"). */
    total?: number;
}

const encodeCursor = (id: string): string => Buffer.from(id).toString("base64url");

const decodeCursor = (value: unknown): string | null => {
    if (value === undefined || value === "") return null;
    const id = typeof value === "string" ? Buffer.from(value, "base64url").toString() : "";
    if (!isValidId(id)) {
        throw new BadRequestException(`Invalid "cursor". Use next_cursor from the previous page.`);
    }
    return id;
};

const parseTake = (value: unknown, fallback: number, max: number): number => {
    if (value === undefined || value === "") return fallback;
    const take = Number(value);
    if (!Number.isInteger(take) || take < 1 || take > max) {
        throw new BadRequestException(`"take" must be a whole number from 1 to ${max}`);
    }
    return take;
};

const readString = (value: unknown): string | undefined => (typeof value === "string" && value.trim() ? value.trim() : undefined);

/**
 * One request's page: parsed from ?cursor=&take=&order_by=&order=, it builds the findMany arguments
 * and turns the rows that come back into the page plus its meta.
 *
 * @example
 *   const page = CursorPagination.parse(query, CHAT_LIST_PAGINATION);
 *   const rows = await prisma.chats.findMany({ where, orderBy: page.orderBy, ...page.args((id) => ({ id })) });
 *   const { rows: chats, pagination } = page.result(rows, (chat) => chat.id);
 */
export class CursorPagination<Column extends string = never> {
    private constructor(
        readonly take: number,
        /** Id of the last row of the previous page, or null for the first page. */
        readonly cursor: string | null,
        /** Ready for Prisma's orderBy, ending with id so the order is total (empty for fixed-order lists). */
        readonly orderBy: OrderBy<Column>[],
    ) {}

    /** Validates the query; anything invalid is a 400 that says what is allowed. */
    static parse<Field extends string = never, Column extends string = never>(
        query: Record<string, unknown>,
        {
            orderFields,
            defaultOrderBy,
            defaultOrder = "desc",
            defaultTake = 20,
            maxTake = 100,
        }: CursorPaginationOptions<Field, Column> = {},
    ): CursorPagination<Column> {
        const take = parseTake(query.take, defaultTake, maxTake);
        const cursor = decodeCursor(query.cursor);
        if (!orderFields || !defaultOrderBy) return new CursorPagination<Column>(take, cursor, []);

        const allowed = Object.keys(orderFields) as Field[];
        const field = (readString(query.order_by) ?? defaultOrderBy) as Field;
        if (!allowed.includes(field)) {
            throw new BadRequestException(`Invalid "order_by". Use one of: ${allowed.join(", ")}`);
        }
        const order = (readString(query.order)?.toLowerCase() ?? defaultOrder) as SortDirection;
        if (order !== "asc" && order !== "desc") {
            throw new BadRequestException(`Invalid "order". Use "asc" or "desc"`);
        }

        const orderBy = [...orderFields[field].map((column) => ({ [column]: order }) as OrderBy<Column>), { id: order } as OrderBy<Column>];
        return new CursorPagination<Column>(take, cursor, orderBy);
    }

    /**
     * take / cursor / skip for findMany. `toUnique` turns the cursor id into the model's unique
     * where (`(id) => ({ id })`, or a compound key). One extra row is fetched to tell if there's more.
     */
    args<Unique>(toUnique: (id: string) => Unique): { take: number; cursor?: Unique; skip?: number } {
        return {
            take: this.take + 1,
            // skip: 1 leaves out the cursor row itself, which ended the previous page
            ...(this.cursor ? { cursor: toUnique(this.cursor), skip: 1 } : {}),
        };
    }

    /** The page's rows (without the extra one) and its meta. `idOf` is the id the next cursor points at. */
    result<Row>(rows: Row[], idOf: (row: Row) => string, extra: { total?: number } = {}): { rows: Row[]; pagination: CursorPageMeta } {
        const has_more = rows.length > this.take;
        const page = has_more ? rows.slice(0, this.take) : rows;
        const last = page[page.length - 1];
        return {
            rows: page,
            pagination: {
                take: this.take,
                next_cursor: has_more && last ? encodeCursor(idOf(last)) : null,
                has_more,
                ...extra,
            },
        };
    }
}
