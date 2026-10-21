import { applyDecorators, type INestApplication } from "@nestjs/common";
import { ApiQuery, DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { ADMIN_COOKIE, AUTH_COOKIE } from "./constants";

/** Documents the query params read by parsePagination, plus the optional search term. */
export const PaginationQuery = (orderFields: string[]) =>
    applyDecorators(
        ApiQuery({ name: "page", required: false, type: Number, example: 1 }),
        ApiQuery({ name: "take", required: false, type: Number, example: 20 }),
        ApiQuery({ name: "order_by", required: false, enum: orderFields }),
        ApiQuery({ name: "order", required: false, enum: ["asc", "desc"] }),
        ApiQuery({ name: "search", required: false, type: String }),
    );

export const SWAGGER_PATH = "api/docs";

// Security scheme names, referenced by @ApiBearerAuth / @ApiCookieAuth on the base controllers
export const USER_AUTH = "user";
export const ADMIN_AUTH = "admin";

/** Serves Swagger UI at /api/docs and the OpenAPI JSON at /api/docs-json. */
export const setupSwagger = (app: INestApplication): void => {
    const document = new DocumentBuilder()
        .setTitle("BuzzChat API")
        .setDescription(
            "REST API for BuzzChat. Log in with POST /user/login (or POST /admin/verify for admin routes), " +
                "then paste the returned token into Authorize. Files are uploaded first with POST /assets, " +
                "and other routes take the returned asset ids.",
        )
        .setVersion("1.0")
        .addBearerAuth(
            { type: "http", scheme: "bearer", bearerFormat: "JWT", description: "access_token from POST /user/login" },
            USER_AUTH,
        )
        .addBearerAuth(
            { type: "http", scheme: "bearer", bearerFormat: "JWT", description: "admin_token from POST /admin/verify" },
            ADMIN_AUTH,
        )
        .addCookieAuth(AUTH_COOKIE, { type: "apiKey", in: "cookie", name: AUTH_COOKIE }, `${USER_AUTH}-cookie`)
        .addCookieAuth(ADMIN_COOKIE, { type: "apiKey", in: "cookie", name: ADMIN_COOKIE }, `${ADMIN_AUTH}-cookie`)
        .build();

    SwaggerModule.setup(SWAGGER_PATH, app, () => SwaggerModule.createDocument(app, document), {
        customSiteTitle: "BuzzChat API Docs",
        swaggerOptions: { persistAuthorization: true },
    });
};
