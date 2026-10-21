import { createHash, timingSafeEqual } from "crypto";

const sha256 = (value: string) => createHash("sha256").update(value).digest();

/**
 * Compares two secrets in constant time, so response timing doesn't reveal how much matched.
 * Both are hashed first because timingSafeEqual needs equal-length inputs.
 */
export const secretsMatch = (given: string, expected: string): boolean => timingSafeEqual(sha256(given), sha256(expected));
