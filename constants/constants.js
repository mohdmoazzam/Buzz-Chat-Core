const cookieOptions = {
    maxAge: 15 * 24 * 60 * 60 * 1000,
    sameSite: "none",
    httpOnly: true,
    secure: true,
};

const AppConfig = {
    TOKEN_NAME: "buzzChat-token",
    ADMIN_TOKEN_NAME: "buzzChat-admin-token",
    JWT_SECRET: process.env.JWT_SECRET ?? "buzzChat",
    ENV: process.env.NODE_ENV ?? "Production",
    PORT: process.env.PORT ?? 3000,
    CLOUDINARY_CLOUD_NAME: "drczl4fq5",
    CLOUDINARY_API_KEY: "846198475675984",
    CLOUDINARY_SECRET_KEY: "nQPMcUu4HSCIQaqQiRYLk5IytEs"
};

// 3–20 characters: letters, numbers, underscore or dot
const USERNAME_REGEX = /^[a-zA-Z0-9_.]{3,20}$/;
const USERNAME_RULE_MESSAGE = "Username must be 3–20 characters: letters, numbers, _ or .";

const GENDERS = ["male", "female", "other", "prefer_not_to_say"];

// Stored normalized: optional leading +, then 7–15 digits
const PHONE_REGEX = /^\+?[0-9]{7,15}$/;

export { cookieOptions, AppConfig, USERNAME_REGEX, USERNAME_RULE_MESSAGE, GENDERS, PHONE_REGEX };