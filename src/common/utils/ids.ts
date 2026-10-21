// Ids are lowercase UUIDs, exactly as Postgres returns them, so plain string
// comparison is safe everywhere.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const isValidId = (id: unknown): id is string => typeof id === "string" && UUID_REGEX.test(id);

export const areValidIds = (ids: unknown): ids is string[] => Array.isArray(ids) && ids.every(isValidId);

/** Normalizes a single id or an array of ids into a de-duplicated string list. */
export const toIdList = (value: unknown): string[] => [...new Set(([] as unknown[]).concat(value ?? []).map(String))];

/** The unique key of the 1:1 chat between two users (same for either order). */
export const directChatKey = (a: string, b: string): string => [a, b].sort().join(":");
