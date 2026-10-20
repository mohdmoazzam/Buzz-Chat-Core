import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { config } from "../config/env";
import { isValidId } from "../common/utils/ids";

type TokenPayload = { sub?: unknown; role?: unknown };

@Injectable()
export class TokenService {
    constructor(private readonly jwt: JwtService) {}

    signUser(userId: string): string {
        return this.jwt.sign({ sub: userId }, { expiresIn: config.tokenTtlSeconds });
    }

    // The admin token only carries a role claim; it never contains the secret itself
    signAdmin(): string {
        return this.jwt.sign({ role: "admin" }, { expiresIn: config.adminTokenTtlSeconds });
    }

    /** The user id in a valid session token, or null (expired, tampered, or pre-Postgres). */
    userIdFrom(token: string | null): string | null {
        const userId = this.verify(token)?.sub;
        return isValidId(userId) ? userId : null;
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
