import { applyDecorators, HttpException, HttpStatus, Injectable, SetMetadata, type ExecutionContext } from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { RATE_LIMIT_DEFAULT_MESSAGE } from "../constants";

const RATE_LIMIT_MESSAGE = "rateLimitMessage";

/** A stricter per-route limit (e.g. login brute-force protection) with its own message. */
export const RateLimit = (limit: number, windowMinutes: number, message: string) =>
    applyDecorators(
        Throttle({ default: { limit, ttl: windowMinutes * 60 * 1000 } }),
        SetMetadata(RATE_LIMIT_MESSAGE, message)
    );

/**
 * Routes without @RateLimit share one per-IP budget (the global API ceiling);
 * routes with it are counted separately. Responds in the app's error format.
 */
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
    override async canActivate(context: ExecutionContext): Promise<boolean> {
        // Socket events are not rate limited here
        if (context.getType() !== "http") return true;
        return super.canActivate(context);
    }

    protected override generateKey(context: ExecutionContext, suffix: string, name: string): string {
        return this.routeMessage(context) ? super.generateKey(context, suffix, name) : `${name}-${suffix}`;
    }

    protected override async throwThrottlingException(context: ExecutionContext): Promise<void> {
        throw new HttpException(this.routeMessage(context) ?? RATE_LIMIT_DEFAULT_MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
    }

    private routeMessage(context: ExecutionContext): string | undefined {
        return this.reflector.getAllAndOverride<string>(RATE_LIMIT_MESSAGE, [context.getHandler(), context.getClass()]);
    }
}
