import { model, Schema, type Types } from "mongoose";
import { GENDERS, type Gender } from "./user.constants.js";

export interface Avatar {
    public_id: string;
    url: string;
}

export interface IUser {
    _id: Types.ObjectId;
    name: string;
    bio: string;
    username: string;
    gender?: Gender;
    phone?: string;
    password: string;
    avatar: Avatar;
    createdAt: Date;
    updatedAt: Date;
}

/** The minimal user shape returned by populate("…", "name avatar"). */
export type UserSummary = { _id: Types.ObjectId | string; name: string; username?: string; avatar?: Avatar };

const schema = new Schema<IUser>({
    name: { type: String, required: true },
    bio: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    gender: { type: String, enum: GENDERS },
    phone: { type: String, trim: true },
    password: { type: String, required: true, select: false },
    avatar: {
        public_id: { type: String, required: true },
        url: { type: String, required: true },
    },
}, { timestamps: true });

// Never expose the password hash, even if a query forgets select(-password)
schema.set("toJSON", {
    transform: (_doc, ret) => {
        const { password: _password, __v: _version, ...safe } = ret;
        return safe;
    },
});

export const User = model<IUser>("User", schema);
