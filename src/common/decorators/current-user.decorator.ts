import { createParamDecorator, UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { AuthUser } from "../../modules/user/user.serializer";

/** The authenticated user (routes behind JwtAuthGuard), loaded by JwtStrategy. Pass `user.id` where an id is needed. */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthUser => {
    const user = context.switchToHttp().getRequest<Request>().user;
    if (!user) throw new UnauthorizedException("Please log in to continue");
    return user;
});
