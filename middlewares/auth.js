import { AppConfig } from "../constants/constants.js";
import { User } from "../models/user.model.js";
import { ErrorHandler } from "../utils/utility.js";
import { TryCatch } from "./error.js";
import jwt from "jsonwebtoken";

const isAuthenticated = TryCatch(async (req, res, next) => {
    const token = req.cookies["buzzChat-token"] || req.header("Authorization")?.replace("Bearer ", "");
    if (!token || token === "null") {
        return next(new ErrorHandler("Unauthorized", 401));
    }
    const decoded = jwt.verify(token, AppConfig.JWT_SECRET);
    req.user = decoded._id;
    next();
});


const adminOnly = TryCatch(async (req, res, next) => {
    const token = req.header("Authorization");
    if (!token) {
        return next(new ErrorHandler("Unauthorized", 401));
    }
    const secretKey = jwt.verify(token, AppConfig.JWT_SECRET);
    const adminSecretKey = process.env.ADMIN_SECRET_KEY;
    const isMatched = secretKey === adminSecretKey;
    if (!isMatched) {
        return next(new ErrorHandler("Only admin can access these route", 401));
    } else {
        next();
    }
});

const socketAuthenticator = async (socket, next) => {
    try {
        const authToken = socket.handshake.auth.token;
        if (!authToken) {
            throw new Error('Authentication error: Token not found in headers');
        }

        const token = authToken.replace('Bearer ', '');
        const decoded = jwt.verify(token, AppConfig.JWT_SECRET);
        const user = await User.findById(decoded._id);
        if (!user) {
            throw new Error('Authentication error: User not found');
        }
        socket.user = user;

        next();
    } catch (error) {
        console.error('Authentication error:', error.message);
        next(new Error('Authentication error'));
    }
};

export { isAuthenticated, adminOnly, socketAuthenticator };