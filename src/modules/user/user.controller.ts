import { asyncHandler } from "../../common/middlewares/asyncHandler.js";
import { currentUserId, ErrorHandler, isDuplicateKeyError } from "../../common/errors.js";
import { deleteFiles, uploadFiles } from "../../common/utils/storage.js";
import {
    BIO_MAX, GENDERS, NAME_MAX, PHONE_REGEX, USERNAME_REGEX, USERNAME_RULE_MESSAGE, type Gender,
} from "./user.constants.js";
import { User } from "./user.model.js";
import { isUsernameTaken } from "./user.service.js";

const asTrimmedString = (value: unknown): string | undefined =>
    typeof value === "string" ? value.trim() : undefined;

export const getProfile = asyncHandler(async (req, res) => {
    const user = await User.findById(currentUserId(req));
    return res.status(200).json({ success: true, user });
});

export const checkUsername = asyncHandler(async (req, res) => {
    const username = String(req.query.username ?? "").trim();
    if (!USERNAME_REGEX.test(username)) {
        return res.status(200).json({ success: true, available: false, message: USERNAME_RULE_MESSAGE });
    }
    const taken = await isUsernameTaken(username, currentUserId(req));
    return res.status(200).json({
        success: true,
        available: !taken,
        message: taken ? "Username is already taken" : "Username is available",
    });
});

export const updateProfile = asyncHandler(async (req, res, next) => {
    const user = await User.findById(currentUserId(req));
    if (!user) {
        return next(new ErrorHandler("User not found", 404));
    }

    const name = asTrimmedString(req.body.name);
    const bio = asTrimmedString(req.body.bio);
    const username = asTrimmedString(req.body.username);
    const gender = asTrimmedString(req.body.gender);
    const phone = asTrimmedString(req.body.phone);

    // Validate everything before touching uploads or the database
    if (name !== undefined && (!name || name.length > NAME_MAX)) {
        return next(new ErrorHandler(`Name must be 1–${NAME_MAX} characters`, 400));
    }
    if (bio !== undefined && (!bio || bio.length > BIO_MAX)) {
        return next(new ErrorHandler(`Bio must be 1–${BIO_MAX} characters`, 400));
    }
    if (gender && !GENDERS.includes(gender as Gender)) {
        return next(new ErrorHandler("Invalid gender", 400));
    }
    const normalizedPhone = phone?.replace(/[\s\-().]/g, "");
    if (normalizedPhone && !PHONE_REGEX.test(normalizedPhone)) {
        return next(new ErrorHandler("Enter a valid phone number (7–15 digits)", 400));
    }
    if (username !== undefined && username !== user.username) {
        if (!USERNAME_REGEX.test(username)) {
            return next(new ErrorHandler(USERNAME_RULE_MESSAGE, 400));
        }
        if (await isUsernameTaken(username, user._id)) {
            return next(new ErrorHandler("Username is already taken", 409));
        }
        user.username = username;
    }

    if (name !== undefined) user.name = name;
    if (bio !== undefined) user.bio = bio;
    if (gender !== undefined) user.gender = (gender || undefined) as Gender | undefined;
    if (phone !== undefined) user.phone = normalizedPhone || undefined;

    let oldAvatarId: string | undefined;
    let newAvatarId: string | undefined;
    if (req.file) {
        const [uploaded] = await uploadFiles([req.file]);
        oldAvatarId = user.avatar?.public_id;
        newAvatarId = uploaded.public_id;
        user.avatar = { public_id: uploaded.public_id, url: uploaded.secureUrl };
    }

    try {
        await user.save();
    } catch (error) {
        if (newAvatarId) deleteFiles([newAvatarId]);
        // Unique index race: someone took the username between check and save
        if (isDuplicateKeyError(error)) {
            return next(new ErrorHandler("Username is already taken", 409));
        }
        throw error;
    }
    if (oldAvatarId) deleteFiles([oldAvatarId]);

    return res.status(200).json({ success: true, message: "Profile updated", user });
});
