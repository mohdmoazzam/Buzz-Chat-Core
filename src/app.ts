import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { config } from "./config/env.js";
import { isDbReady } from "./config/db.js";
import { errorMiddleware, notFoundHandler } from "./common/middlewares/error.js";
import { apiLimiter } from "./common/middlewares/rateLimit.js";
import adminRoutes from "./modules/admin/admin.routes.js";
import authRoutes from "./modules/auth/auth.routes.js";
import chatRoutes from "./modules/chat/chat.routes.js";
import friendRoutes from "./modules/friend/friend.routes.js";
import userRoutes from "./modules/user/user.routes.js";

// Express app only; the HTTP server, sockets and DB are started in server.ts
export const app = express();

// Behind Render/Vercel proxies: use the real client IP for rate limiting
app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: config.corsOrigins, credentials: true }));
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));
app.use(cookieParser());

app.get("/", (_req, res) => {
    res.send("Server is running");
});

app.get("/health", (_req, res) => {
    res.status(isDbReady() ? 200 : 503).json({
        status: isDbReady() ? "ok" : "degraded",
        uptime: Math.round(process.uptime()),
    });
});

app.use("/api", apiLimiter);

// auth, user and friend share the /user prefix to keep existing client URLs
app.use("/api/v1/user", authRoutes, userRoutes, friendRoutes);
app.use("/api/v1/chat", chatRoutes);
app.use("/api/v1/admin", adminRoutes);

app.use(notFoundHandler);
app.use(errorMiddleware);
