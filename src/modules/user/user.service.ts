import type { FilterQuery } from "mongoose";
import type { Id } from "../../common/utils/ids.js";
import { escapeRegex } from "../../common/utils/regex.js";
import { User, type IUser } from "./user.model.js";

// Case-insensitive exact match so "John" and "john" are treated as the same username
export const usernameQuery = (username: string): FilterQuery<IUser> => ({
    username: { $regex: `^${escapeRegex(username)}$`, $options: "i" },
});

export const isUsernameTaken = async (username: string, excludeUserId?: Id): Promise<boolean> => {
    const query = usernameQuery(username);
    if (excludeUserId) query._id = { $ne: excludeUserId };
    return Boolean(await User.exists(query));
};
