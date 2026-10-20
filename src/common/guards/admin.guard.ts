import { Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { TokenService } from "../../core/token.service";
import { ADMIN_COOKIE } from "../constants";
import { parseBearer } from "../utils/bearer";

@Injectable()
export class AdminGuard implements CanActivate {
    constructor(private readonly tokens: TokenService) {}

    canActivate(context: ExecutionContext): boolean {
        const req = context.switchToHttp().getRequest<Request>();
        const token = parseBearer(req.header("Authorization")) || parseBearer(req.cookies?.[ADMIN_COOKIE]);
        if (!this.tokens.isAdmin(token)) {
            throw new UnauthorizedException("Only admins can access this route");
        }
        return true;
    }
}
