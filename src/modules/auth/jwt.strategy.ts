import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import type { Request } from "express";
import { Strategy } from "passport-jwt";
import { config } from "../../config/env";
import { AUTH_COOKIE } from "../../common/constants";
import { parseBearer } from "../../common/utils/bearer";
import { SessionService } from "../../core/session.service";
import { sessionClaimsOf } from "../../core/token.service";
import type { AuthUser } from "../user/user.serializer";

/**
 * Session tokens from the Authorization header or the session cookie. Both are
 * read with parseBearer, so a client sending "Bearer null" still falls back to the cookie.
 */
const fromHeaderOrCookie = (req: Request): string | null =>
    parseBearer(req.header("Authorization")) || parseBearer(req.cookies?.[AUTH_COOKIE]);

/** Verifies the session JWT and its sessions row, so req.user is the full user (minus password). */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
    constructor(private readonly sessions: SessionService) {
        super({ jwtFromRequest: fromHeaderOrCookie, secretOrKey: config.jwtSecret, ignoreExpiration: false, passReqToCallback: true });
    }

    // Returning null rejects the request: admin tokens, tokens from before sessions existed,
    // logged-out devices, deleted accounts
    async validate(req: Request, payload: { sub?: unknown; sid?: unknown }): Promise<AuthUser | null> {
        const claims = sessionClaimsOf(payload);
        if (!claims) return null;
        const user = await this.sessions.userFor(claims);
        if (user) req.sessionId = claims.sessionId;
        return user;
    }
}
