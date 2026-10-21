import { Injectable } from "@nestjs/common";
import type { Server } from "socket.io";
import { SESSION_REVOKED } from "../socket/events";

// Every socket joins a per-user room, so a user with several tabs/devices
// receives events on all of them and closing one doesn't break the others.
export const userRoom = (userId: string) => `user:${userId}`;

// ...and a per-session room, so logging out one device only closes that device's sockets
export const sessionRoom = (sessionId: string) => `session:${sessionId}`;

/** Lets HTTP services push socket events; the gateway attaches the server on startup. */
@Injectable()
export class RealtimeService {
    private server: Server | null = null;

    attach(server: Server): void {
        this.server = server;
    }

    /** Emit an event to every connected socket of the given users. */
    emitToUsers(userIds: string[], event: string, data?: unknown): void {
        if (!this.server) return;
        const rooms = [...new Set(userIds.map(userRoom))];
        if (rooms.length) {
            this.server.to(rooms).emit(event, data);
        }
    }

    /** Tells the sockets of revoked sessions why, then closes them (they only authenticated at handshake). */
    endSessions(sessionIds: string[]): void {
        if (!this.server || !sessionIds.length) return;
        const rooms = sessionIds.map(sessionRoom);
        this.server.to(rooms).emit(SESSION_REVOKED);
        this.server.in(rooms).disconnectSockets(true);
    }
}
