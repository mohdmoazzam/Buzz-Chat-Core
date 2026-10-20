import { v2 as cloudinary } from "cloudinary";
import { config } from "./env.js";

export const configureCloudinary = (): void => {
    cloudinary.config({
        cloud_name: config.cloudinary.cloudName,
        api_key: config.cloudinary.apiKey,
        api_secret: config.cloudinary.apiSecret,
        secure: true,
    });
};

export const isCloudinaryConfigured = (): boolean =>
    Boolean(config.cloudinary.cloudName && config.cloudinary.apiKey && config.cloudinary.apiSecret);
