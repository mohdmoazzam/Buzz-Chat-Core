import type { Prisma } from "../../../prisma/generated/client";

/** A trimmed search term from the query string, capped at `max` characters. */
export const readSearch = (value: unknown, max: number): string =>
    typeof value === "string" ? value.trim().slice(0, max) : "";

/**
 * Case-insensitive "contains" filter for Prisma. LIKE wildcards are escaped
 * so searching for "50%" or "a_b" matches literally.
 */
export const containsText = (search: string) => ({
    contains: search.replace(/[\\%_]/g, "\\$&"),
    mode: "insensitive" as const,
});

/**
 * Matches people by first name, last name or username, and "John Do" style
 * full names (first word in first_name, the rest in last_name).
 */
export const personFilter = (search: string): Prisma.usersWhereInput => {
    const text = containsText(search);
    const [first, ...rest] = search.split(/\s+/);
    return {
        OR: [
            { first_name: text },
            { last_name: text },
            { username: text },
            ...(rest.length ? [{ first_name: containsText(first), last_name: containsText(rest.join(" ")) }] : []),
        ],
    };
};
