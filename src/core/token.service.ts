import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { config } from "../config/env";
import { isValidId } from "../common/utils/ids";

type TokenPayload = { sub?: unknown; sid?: unknown; role?: unknown };

/** Who a session token belongs to, and which sessions row (device) it is. */
export type SessionClaims = { userId: string; sessionId: string };

/** The claims of a decoded session token, or null when they aren't both valid ids. */
export const sessionClaimsOf = (payload: TokenPayload): SessionClaims | null =>
    isValidId(payload.sub) && isValidId(payload.sid) ? { userId: payload.sub, sessionId: payload.sid } : null;

@Injectable()
export class TokenService {
    constructor(private readonly jwt: JwtService) {}

    signUser(userId: string, sessionId: string): string {
        return this.jwt.sign({ sub: userId, sid: sessionId }, { expiresIn: config.tokenTtlSeconds });
    }

    // The admin token only carries a role claim; it never contains the secret itself
    signAdmin(): string {
        return this.jwt.sign({ role: "admin" }, { expiresIn: config.adminTokenTtlSeconds });
    }

    /**
     * The claims of a valid session token, or null (expired, tampered, or issued before
     * sessions existed). The session itself still has to be checked with SessionService.
     */
    sessionFrom(token: string | null): SessionClaims | null {
        const payload = this.verify(token);
        return payload ? sessionClaimsOf(payload) : null;
    }

    isAdmin(token: string | null): boolean {
        return this.verify(token)?.role === "admin";
    }

    private verify(token: string | null): TokenPayload | null {
        if (!token) return null;
        try {
            return this.jwt.verify<TokenPayload>(token);
        } catch {
            return null;
        }
    }
}
