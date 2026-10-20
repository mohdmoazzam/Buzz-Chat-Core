import { Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/** Requires a valid session; runs JwtStrategy, which puts the full user on req.user. */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
    // Same message as before for missing, expired or invalid sessions; real errors (e.g. DB down) pass through
    override handleRequest<TUser>(error: unknown, user: TUser | false | null): TUser {
        if (error) throw error;
        if (!user) throw new UnauthorizedException("Please log in to continue");
        return user;
    }
}

/** Sets req.user when there is a valid session, but lets anonymous requests through. */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard("jwt") {
    override handleRequest<TUser>(error: unknown, user: TUser | false | null): TUser | undefined {
        if (error) throw error;
        return user || undefined;
    }
}
