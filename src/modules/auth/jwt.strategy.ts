import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import type { Request } from "express";
import { Strategy } from "passport-jwt";
import { config } from "../../config/env";
import { AUTH_COOKIE } from "../../common/constants";
import { parseBearer } from "../../common/utils/bearer";
import { isValidId } from "../../common/utils/ids";
import { PrismaService } from "../../core/prisma.service";
import { USER_VIEW, type AuthUser } from "../user/user.serializer";

/**
 * Session tokens from the Authorization header or the session cookie. Both are
 * read with parseBearer, so a client sending "Bearer null" still falls back to the cookie.
 */
const fromHeaderOrCookie = (req: Request): string | null =>
    parseBearer(req.header("Authorization")) || parseBearer(req.cookies?.[AUTH_COOKIE]);

/** Verifies the session JWT and loads the user, so req.user is the full user (minus password). */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
    constructor(private readonly prisma: PrismaService) {
        super({ jwtFromRequest: fromHeaderOrCookie, secretOrKey: config.jwtSecret, ignoreExpiration: false });
    }

    // Returning null rejects the request: admin tokens (no sub), pre-Postgres ids, deleted accounts
    async validate(payload: { sub?: unknown }): Promise<AuthUser | null> {
        if (!isValidId(payload.sub)) return null;
        return this.prisma.users.findUnique({ where: { id: payload.sub }, ...USER_VIEW });
    }
}
