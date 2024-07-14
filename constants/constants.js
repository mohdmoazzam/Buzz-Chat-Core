const cookieOptions = {
    maxAge: 15 * 24 * 60 * 60 * 1000,
    sameSite: "none",
    httpOnly: true,
};

const AppConfig = {
    TOKEN_NAME: "buzzChat-token",
    ADMIN_TOKEN_NAME: "buzzChat-admin-token",
    JWT_SECRET: "buzzChat",
    ENV: process.env.NODE_ENV ?? "Producation",
    PORT: process.env.PORT ?? 3000,
    CLOUDINARY_CLOUD_NAME: "drczl4fq5",
    CLOUDINARY_API_KEY: "846198475675984",
    CLOUDINARY_SECRET_KEY: "nQPMcUu4HSCIQaqQiRYLk5IytEs"
};

export { cookieOptions, AppConfig };