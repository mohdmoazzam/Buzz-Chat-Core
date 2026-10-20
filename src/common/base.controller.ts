import { UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiCookieAuth, ApiUnauthorizedResponse } from "@nestjs/swagger";
import { AdminGuard } from "./guards/admin.guard";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { ADMIN_AUTH, USER_AUTH } from "./swagger";

// Class-level guards (and their Swagger security docs) are inherited, so every route
// of a subclass is protected. Routes that must stay public belong in a controller
// that doesn't extend these.

/** Base for controllers whose routes all require a logged-in user. */
@UseGuards(JwtAuthGuard)
@ApiBearerAuth(USER_AUTH)
@ApiCookieAuth(`${USER_AUTH}-cookie`)
@ApiUnauthorizedResponse({ description: "Missing, expired or invalid session" })
export abstract class AuthenticatedController {}

/** Base for controllers whose routes all require an admin session. */
@UseGuards(AdminGuard)
@ApiBearerAuth(ADMIN_AUTH)
@ApiCookieAuth(`${ADMIN_AUTH}-cookie`)
@ApiUnauthorizedResponse({ description: "Missing or expired admin session" })
export abstract class AdminBaseController {}
