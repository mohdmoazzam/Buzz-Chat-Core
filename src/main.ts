import "reflect-metadata";
import { Logger, RequestMethod } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { setupSwagger, SWAGGER_PATH } from "./common/swagger";
import { createValidationPipe } from "./common/validation";
import { config } from "./config/env";
import { MailService } from "./core/mail.service";
import { StorageService } from "./core/storage.service";
import { isDevMasterPasswordEnabled } from "./modules/auth/dev-master-password";

// Body-parser errors happen before Nest's router, so they're answered here in the app's format
const bodyParserErrors = (err: { type?: string }, _req: Request, res: Response, next: NextFunction) => {
    if (err?.type === "entity.too.large") {
        return res.status(413).json({ success: false, message: "Request is too large" });
    }
    if (err?.type === "entity.parse.failed") {
        return res.status(400).json({ success: false, message: "Invalid JSON body" });
    }
    return next(err);
};

async function bootstrap() {
    const logger = new Logger("Bootstrap");
    const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });

    // Behind Render/Vercel proxies: use the real client IP for rate limiting
    app.set("trust proxy", 1);
    app.disable("x-powered-by");

    app.use(
        helmet({
            crossOriginResourcePolicy: { policy: "cross-origin" },
            // Over plain http (local dev) upgrading would load Swagger UI's scripts from https and leave a blank page
            contentSecurityPolicy: { directives: { upgradeInsecureRequests: config.isProduction ? [] : null } },
        })
    );
    app.enableCors({ origin: config.corsOrigins, credentials: true });
    app.use(express.json({ limit: "100kb" }));
    app.use(express.urlencoded({ extended: false, limit: "100kb" }));
    app.use(bodyParserErrors);
    // Express 5 leaves req.body undefined when no parser ran (e.g. a multipart request from an
    // old client); use {} so handlers return validation errors instead of crashing
    app.use((req: Request, _res: Response, next: NextFunction) => {
        req.body ??= {};
        next();
    });
    app.use(cookieParser());

    // Every API route lives under /api/v1; "/" and "/health" stay at the root for uptime checks
    app.setGlobalPrefix("api/v1", {
        exclude: [{ path: "/", method: RequestMethod.GET }, { path: "health", method: RequestMethod.GET }],
    });
    app.useGlobalPipes(createValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter());
    // Finish in-flight work and close the DB pool on SIGTERM (Render sends it on deploys)
    app.enableShutdownHooks();

    if (config.swaggerEnabled) setupSwagger(app);

    await app.listen(config.port);

    logger.log(`*** ENV - ${config.env} ***`);
    logger.log(`*** Server is up and running on port ${config.port} ***`);
    if (config.swaggerEnabled) {
        logger.log(`*** API docs: http://localhost:${config.port}/${SWAGGER_PATH} ***`);
    }
    if (!app.get(StorageService).isConfigured) {
        logger.warn("*** Cloudinary is not configured: avatar and file uploads will fail ***");
    }
    if (!app.get(MailService).isConfigured) {
        logger.warn("*** Brevo is not configured (BREVO_API_KEY, BREVO_SENDER_EMAIL): forgot password will fail ***");
    }
    if (isDevMasterPasswordEnabled()) {
        logger.warn("*** [DEV] Master password login is ENABLED (localhost only). Never use this in production. ***");
    }
}

process.on("unhandledRejection", (reason) => console.error("Unhandled rejection:", reason));

bootstrap().catch((error) => {
    console.error("Failed to start the server:", (error as Error).message);
    process.exit(1);
});
