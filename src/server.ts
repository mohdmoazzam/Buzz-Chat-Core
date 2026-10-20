import { createServer } from "http";
import { app } from "./app.js";
import { configureCloudinary, isCloudinaryConfigured } from "./config/cloudinary.js";
import { closeDb, connectToDb } from "./config/db.js";
import { config } from "./config/env.js";
import { isDevMasterPasswordEnabled } from "./modules/auth/devMasterPassword.js";
import { closeSocket, initSocket } from "./socket/index.js";

configureCloudinary();

const server = createServer(app);
initSocket(server);

const start = async () => {
    try {
        await connectToDb();
        console.info("*** DB Connected Successfully ***");
    } catch (error) {
        console.error("Failed to connect to MongoDB:", (error as Error).message);
        process.exit(1);
    }

    server.listen(config.port, () => {
        console.info(`*** ENV - ${config.env} ***`);
        console.info(`*** Server is up and running on port ${config.port} ***`);
        if (!isCloudinaryConfigured()) {
            console.warn("*** Cloudinary is not configured: avatar and file uploads will fail ***");
        }
        if (isDevMasterPasswordEnabled()) {
            console.warn("*** [DEV] Master password login is ENABLED (localhost only). Never use this in production. ***");
        }
    });
};

// Finish in-flight work before exiting (Render sends SIGTERM on deploys)
const shutdown = (signal: string) => {
    console.info(`${signal} received, shutting down...`);
    setTimeout(() => process.exit(1), 10_000).unref();
    closeSocket()
        .then(() => new Promise<void>((resolve) => server.close(() => resolve())))
        .then(() => closeDb())
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => console.error("Unhandled rejection:", reason));

start();
