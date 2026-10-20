import type { AuthUser } from "../modules/user/user.serializer";

// Passport types req.user as Express.User; JwtStrategy sets it to the logged-in user
declare global {
    namespace Express {
        interface User extends AuthUser {}
    }
}

export {};
