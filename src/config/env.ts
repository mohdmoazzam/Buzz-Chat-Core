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
    value
        .split(",")
        .map((origin) => origin.trim().replace(/\/+$/, ""))
        .filter(Boolean);

export const config = Object.freeze({
    env: NODE_ENV,
    isProduction,
    port: Number(process.env.PORT) || 3000,

    // Read by Prisma itself; checked here so a missing value fails at startup
    databaseUrl: required("DATABASE_URL"),

    jwtSecret: jwtSecret(),
    tokenTtlSeconds: 15 * 24 * 60 * 60, // 15 days
    adminTokenTtlSeconds: 15 * 60, // 15 minutes
    adminSecretKey: process.env.ADMIN_SECRET_KEY ?? "",

    // Swagger UI at /api/docs: on outside production, opt-in there with SWAGGER_ENABLED=true
    swaggerEnabled: !isProduction || process.env.SWAGGER_ENABLED === "true",

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

    // Sign in with Google: the OAuth web client id ID tokens must be issued for (empty = turned off)
    googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",

    // Links in emails point here
    appUrl: parseOrigins(process.env.APP_URL)[0] ?? "https://buzzchatapp.vercel.app",

    // BullMQ notification queues
    redisUrl: required("REDIS_URL"),
    // Run the queue workers in this process; "false" when a separate worker process runs them
    notificationWorkers: process.env.NOTIFICATION_WORKERS !== "false",

    // Web push: a VAPID key pair from `npx web-push generate-vapid-keys` (empty = push turned off).
    // The subject is a contact the browser push services can reach (mailto: or https:).
    webPush: {
        publicKey: process.env.VAPID_PUBLIC_KEY ?? "",
        privateKey: process.env.VAPID_PRIVATE_KEY ?? "",
        subject: process.env.VAPID_SUBJECT || parseOrigins(process.env.APP_URL)[0] || "https://buzzchatapp.vercel.app",
    },

    // Transactional email (password reset codes). The sender must be verified in Brevo.
    brevo: {
        apiKey: process.env.BREVO_API_KEY ?? "",
        senderEmail: process.env.BREVO_SENDER_EMAIL ?? "",
        senderName: process.env.BREVO_SENDER_NAME ?? "BuzzChat",
    },
});
