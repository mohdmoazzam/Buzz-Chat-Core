import { createParamDecorator, UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

/** The id of the session (device) making the request (routes behind JwtAuthGuard), set by JwtStrategy. */
export const CurrentSession = createParamDecorator((_data: unknown, context: ExecutionContext): string => {
    const sessionId = context.switchToHttp().getRequest<Request>().sessionId;
    if (!sessionId) throw new UnauthorizedException("Please log in to continue");
    return sessionId;
});
