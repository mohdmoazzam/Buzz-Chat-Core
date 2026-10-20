/** Strips an optional "Bearer " prefix and rejects empty/"null" values. */
export const parseBearer = (value: unknown): string | null => {
    if (!value || typeof value !== "string") return null;
    const token = value.replace(/^Bearer\s+/i, "").trim();
    return token && token !== "null" && token !== "undefined" ? token : null;
};
