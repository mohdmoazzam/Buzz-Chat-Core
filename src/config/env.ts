import "dotenv/config";

// Single source of truth for configuration. Required values fail fast in
// production instead of silently falling back to insecure defaults.

const NODE_ENV = process.env.NODE_ENV ?? "production";
const isProduction = NODE_ENV === "production";

const required = (name: string): string => {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
};

// In development, allow a fixed secret so local setup is painless.
const jwtSecret = (): string => {
    if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
    if (isProduction) return required("JWT_SECRET");
    console.warn("*** JWT_SECRET is not set; using an insecure development secret ***");
    return "buzzchat-dev-only-secret";
};

const parseOrigins = (value = ""): string[] =>
    value.split(",").map((origin) => origin.trim().replace(/\/+$/, "")).filter(Boolean);

export const config = Object.freeze({
    env: NODE_ENV,
    isProduction,
    port: Number(process.env.PORT) || 3000,

    // Read by Prisma itself; checked here so a missing value fails at startup
    databaseUrl: required("DATABASE_URL"),

    jwtSecret: jwtSecret(),
    tokenTtlSeconds: 15 * 24 * 60 * 60, // 15 days
    adminTokenTtlSeconds: 15 * 60,      // 15 minutes
    adminSecretKey: process.env.ADMIN_SECRET_KEY ?? "",

    corsOrigins: [
        "http://localhost:5173",
        "https://buzzchatapp.vercel.app",
        // Old Vercel URL; remove once buzzchatapp.vercel.app is live
        "https://buzz-chat-frontend-azure.vercel.app",
        ...parseOrigins(process.env.CLIENT_URL),
    ],

    cloudinary: {
        cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? "",
        apiKey: process.env.CLOUDINARY_API_KEY ?? "",
        apiSecret: process.env.CLOUDINARY_API_SECRET ?? "",
    },
});
