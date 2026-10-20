import type { Socket } from "socket.io";
import { AUTH_COOKIE } from "../common/constants.js";
import { parseBearer, verifyToken } from "../common/utils/token.js";
import { User } from "../modules/user/user.model.js";

export interface SocketUser {
    _id: string;
    name: string;
}

const readCookie = (cookieHeader: string | undefined, name: string): string | undefined =>
    cookieHeader
        ?.split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith(`${name}=`))
        ?.slice(name.length + 1);

/** Accepts the token from the handshake auth payload or the session cookie. */
export const socketAuthenticator = async (socket: Socket, next: (err?: Error) => void) => {
    try {
        const token =
            parseBearer(socket.handshake.auth?.token) ||
            parseBearer(readCookie(socket.handshake.headers?.cookie, AUTH_COOKIE));
        const decoded = token ? verifyToken(token) : null;
        if (typeof decoded?._id !== "string") throw new Error("invalid token");

        const user = await User.findById(decoded._id).select("name").lean();
        if (!user) throw new Error("user not found");

        socket.data.user = { _id: String(user._id), name: user.name } satisfies SocketUser;
        next();
    } catch {
        next(new Error("Authentication error"));
    }
};
