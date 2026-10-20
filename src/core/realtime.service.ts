import { Injectable } from "@nestjs/common";
import type { Server } from "socket.io";

// Every socket joins a per-user room, so a user with several tabs/devices
// receives events on all of them and closing one doesn't break the others.
export const userRoom = (userId: string) => `user:${userId}`;

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
        if (rooms.length) this.server.to(rooms).emit(event, data);
    }
}
