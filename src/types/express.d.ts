import type { AuthUser } from "../modules/user/user.serializer";

// Passport types req.user as Express.User; JwtStrategy sets it to the logged-in user
declare global {
    namespace Express {
        interface User extends AuthUser {}

        interface Request {
            /** The sessions row (device) the request's token belongs to; set by JwtStrategy. */
            sessionId?: string;
        }
    }
}

export {};
