import { Injectable } from "@nestjs/common";
import Bowser from "bowser";
import type { Request } from "express";
import { SESSION_TOUCH_INTERVAL_MS } from "../common/constants";
import { isValidId } from "../common/utils/ids";
import { config } from "../config/env";
import { NAME_SELECT, USER_VIEW, type AuthUser, type UserName } from "../modules/user/user.serializer";
import { PrismaService } from "./prisma.service";
import { RealtimeService } from "./realtime.service";
import type { SessionClaims } from "./token.service";

/** What GET /user/sessions shows for each device (no raw User-Agent). */
const SESSION_SELECT = {
    id: true,
    browser: true,
    os: true,
    device_type: true,
    ip: true,
    created_at: true,
    last_seen_at: true,
} as const;

const USER_AGENT_MAX = 512;

/** "Chrome" / "Windows 11" / "desktop" from a User-Agent; nulls when it can't be read (e.g. curl). */
const deviceOf = (userAgent: string) => {
    if (!userAgent) return { browser: null, os: null, device_type: null };
    const { browser, os, platform } = Bowser.parse(userAgent);
    return {
        browser: browser.name || null,
        os: [os.name, os.versionName].filter(Boolean).join(" ") || null,
        device_type: platform.type || null,
    };
};

/**
 * Logged-in devices. Every login creates a sessions row whose id is the token's `sid`;
 * a token is only accepted while its row exists, so deleting rows logs devices out.
 */
@Injectable()
export class SessionService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly realtime: RealtimeService,
    ) {}

    /** Records a login from this request's device and returns the new session id. */
    async create(userId: string, req: Request): Promise<string> {
        const userAgent = (req.header("User-Agent") ?? "").slice(0, USER_AGENT_MAX);
        const [, session] = await this.prisma.$transaction([
            // Expired logins are cleared here, so the table needs no cleanup job
            this.prisma.sessions.deleteMany({
                where: {
                    user_id: userId,
                    expires_at: { lte: new Date() },
                },
            }),
            this.prisma.sessions.create({
                data: {
                    user_id: userId,
                    ...deviceOf(userAgent),
                    user_agent: userAgent,
                    ip: req.ip ?? null,
                    expires_at: new Date(Date.now() + config.tokenTtlSeconds * 1000),
                },
                select: { id: true },
            }),
        ]);
        return session.id;
    }

    /** The user for req.user, or null when the session was revoked or has expired. */
    async userFor(claims: SessionClaims): Promise<AuthUser | null> {
        const session = await this.prisma.sessions.findFirst({
            where: this.activeWhere(claims),
            select: {
                last_seen_at: true,
                user: USER_VIEW,
            },
        });
        if (!session) return null;
        this.touch(claims.sessionId, session.last_seen_at);
        return session.user;
    }

    /** Same check for socket handshakes, which only need the user's name. Unverified accounts get no socket. */
    async nameFor(claims: SessionClaims): Promise<UserName | null> {
        const session = await this.prisma.sessions.findFirst({
            where: {
                ...this.activeWhere(claims),
                user: { email_verified_at: { not: null } },
            },
            select: {
                last_seen_at: true,
                user: { select: NAME_SELECT },
            },
        });
        if (!session) return null;
        this.touch(claims.sessionId, session.last_seen_at);
        return session.user;
    }

    /** The user's logged-in devices, most recently active first. */
    list(userId: string) {
        return this.prisma.sessions.findMany({
            where: {
                user_id: userId,
                expires_at: { gt: new Date() },
            },
            orderBy: { last_seen_at: "desc" },
            select: SESSION_SELECT,
        });
    }

    /** Logs out one of the user's devices; false when it isn't theirs or is already gone. */
    async revoke(userId: string, sessionId: string): Promise<boolean> {
        if (!isValidId(sessionId)) return false;
        const { count } = await this.prisma.sessions.deleteMany({ where: { id: sessionId, user_id: userId } });
        if (count) this.realtime.endSessions([sessionId]);
        return count > 0;
    }

    /** Logs out every device of the user, optionally keeping one (the caller's). Returns how many. */
    async revokeAll(userId: string, exceptSessionId?: string): Promise<number> {
        const sessions = await this.prisma.sessions.findMany({
            where: {
                user_id: userId,
                ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
            },
            select: { id: true },
        });
        const ids = sessions.map((session) => session.id);
        if (!ids.length) return 0;

        await this.prisma.sessions.deleteMany({
            where: { id: { in: ids } },
        });
        this.realtime.endSessions(ids);
        return ids.length;
    }

    // The token alone isn't enough: the row must still exist, belong to that user and not be expired
    private activeWhere({ userId, sessionId }: SessionClaims) {
        return {
            id: sessionId,
            user_id: userId,
            expires_at: { gt: new Date() },
        };
    }

    // Throttled, so ordinary requests don't each cost a write; a failed update isn't worth failing the request
    private touch(sessionId: string, lastSeenAt: Date): void {
        if (Date.now() - lastSeenAt.getTime() < SESSION_TOUCH_INTERVAL_MS) return;
        this.prisma.sessions
            .updateMany({
                where: { id: sessionId },
                data: { last_seen_at: new Date() },
            })
            .catch(() => undefined);
    }
}
