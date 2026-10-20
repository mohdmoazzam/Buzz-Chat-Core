import { v2 as cloudinary } from "cloudinary";
import { connect } from "mongoose";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { AppConfig, cookieOptions } from "../constants/constants.js";
import { getSockets } from "./helper.js";


dotenv.config();

export function connectToDb() {
    connect(process.env.MONGODB_URL, {
        maxPoolSize: 50,
        wtimeoutMS: 2500
    })
        .then(() => console.log('*** DB Connected Successfully ***'))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        })
}

export function generateToken(res, user, code, message) {
    const token = jwt.sign({ _id: user._id }, AppConfig.JWT_SECRET);
    return res.status(code).cookie(AppConfig.TOKEN_NAME, token, cookieOptions).json({
        success: true,
        message: message,
        access_token: token,
        user: user
    });
}

export function emitEvent(req, event, users, data) {
    let io = req.app.get("io");
    const userSockets = getSockets(users);
    io.to(userSockets).emit(event, data);
};

export async function deleteFilesFromCloudinary(public_ids = []) {
    const ids = public_ids.filter(Boolean);
    if (ids.length === 0) return;
    try {
        await cloudinary.api.delete_resources(ids);
    } catch (error) {
        console.error("Failed to delete files from Cloudinary:", error?.message ?? error);
    }
};