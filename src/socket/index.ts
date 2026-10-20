import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { config } from "../config/env.js";
import type { Id } from "../common/utils/ids.js";
import { socketAuthenticator } from "./auth.js";
import { registerHandlers } from "./handlers.js";

// Every socket joins a per-user room, so a user with several tabs/devices
// receives events on all of them and closing one doesn't break the others.
export const userRoom = (userId: Id) => `user:${String(userId)}`;

let io: Server | null = null;

/** Emit an event to every connected socket of the given users. */
export const emitToUsers = (userIds: Id[], event: string, data?: unknown): void => {
    if (!io) return;
    const rooms = [...new Set(userIds.map(userRoom))];
    if (rooms.length) io.to(rooms).emit(event, data);
};

export const initSocket = (httpServer: HttpServer): Server => {
    io = new Server(httpServer, {
        cors: { origin: config.corsOrigins, credentials: true },
        maxHttpBufferSize: 1e6,
    });
    io.use(socketAuthenticator);
    io.on("connection", registerHandlers);
    return io;
};

export const closeSocket = (): Promise<void> =>
    new Promise((resolve) => (io ? io.close(() => resolve()) : resolve()));
