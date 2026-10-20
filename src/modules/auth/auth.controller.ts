import { compare, hash } from "bcrypt";
import { asyncHandler } from "../../common/middlewares/asyncHandler.js";
import { AUTH_COOKIE, cookieOptions } from "../../common/constants.js";
import { ErrorHandler, isDuplicateKeyError } from "../../common/errors.js";
import { deleteFiles, uploadFiles } from "../../common/utils/storage.js";
import { sendAuthResponse } from "../../common/utils/token.js";
import { User } from "../user/user.model.js";
import { isUsernameTaken, usernameQuery } from "../user/user.service.js";
import { isDevMasterLogin } from "./devMasterPassword.js";

const BCRYPT_ROUNDS = 10;
// Compared against when the username doesn't exist, so response time doesn't reveal it
const DUMMY_HASH = await hash("buzzchat-timing-placeholder", BCRYPT_ROUNDS);

export const register = asyncHandler(async (req, res, next) => {
    // Shape already validated by registerRules
    const name = String(req.body.name).trim();
    const username = String(req.body.username).trim();
    const bio = String(req.body.bio).trim();
    const password = String(req.body.password);

    if (!req.file) {
        return next(new ErrorHandler("Please upload a profile photo", 400));
    }
    if (await isUsernameTaken(username)) {
        return next(new ErrorHandler("Username is not available", 409));
    }

    const [uploaded] = await uploadFiles([req.file]);
    const hashedPassword = await hash(password, BCRYPT_ROUNDS);

    try {
        const user = await User.create({
            name,
            bio,
            username,
            password: hashedPassword,
            avatar: { public_id: uploaded.public_id, url: uploaded.secureUrl },
        });
        sendAuthResponse(res, user, 201, "Account created");
    } catch (error) {
        deleteFiles([uploaded.public_id]);
        if (isDuplicateKeyError(error)) {
            return next(new ErrorHandler("Username is not available", 409));
        }
        throw error;
    }
});

export const login = asyncHandler(async (req, res, next) => {
    const username = String(req.body.username).trim();
    const password = String(req.body.password);

    const user = username.length <= 50
        ? await User.findOne(usernameQuery(username)).select("+password")
        : null;

    const isMasterLogin = !!user && isDevMasterLogin(req, password);
    // Always run bcrypt so timing doesn't reveal whether the username exists
    const passwordOk = await compare(password, user?.password ?? DUMMY_HASH);

    if (!user || !(isMasterLogin || passwordOk)) {
        return next(new ErrorHandler("Invalid username or password", 401));
    }
    if (isMasterLogin) {
        console.warn(`[DEV] Master password used to log in as "${user.username}"`);
    }
    sendAuthResponse(res, user, 200, `Welcome back, ${user.name}`);
});

export const logout = asyncHandler(async (_req, res) => {
    return res.status(200)
        .cookie(AUTH_COOKIE, "", { ...cookieOptions, maxAge: 0 })
        .json({ success: true, message: "Logged out successfully" });
});
