import { ForbiddenException, Injectable, SetMetadata, UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import type { AuthUser } from "../../modules/user/user.serializer";

const ALLOW_UNVERIFIED = "allowUnverified";

/** Lets accounts that haven't verified their email through JwtAuthGuard (on a route or a whole controller). */
export const AllowUnverified = () => SetMetadata(ALLOW_UNVERIFIED, true);

/**
 * Requires a valid session; runs JwtStrategy, which puts the full user on req.user.
 * The email must be verified too, except on routes marked @AllowUnverified().
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
    constructor(private readonly reflector: Reflector) {
        super();
    }

    // Same message as before for missing, expired or invalid sessions; real errors (e.g. DB down) pass through
    override handleRequest<TUser>(error: unknown, user: TUser | false | null, _info: unknown, context: ExecutionContext): TUser {
        if (error) throw error;
        if (!user) throw new UnauthorizedException("Please log in to continue");
        if (!(user as Pick<Partial<AuthUser>, "email_verified_at">).email_verified_at && !this.allowsUnverified(context)) {
            throw new ForbiddenException("Please verify your email to continue");
        }
        return user;
    }

    private allowsUnverified(context: ExecutionContext): boolean {
        return !!this.reflector.getAllAndOverride<boolean>(ALLOW_UNVERIFIED, [context.getHandler(), context.getClass()]);
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
