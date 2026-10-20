import { model, Schema, type Types } from "mongoose";
import { GROUP_DESCRIPTION_MAX } from "./chat.constants.js";

export interface IChat {
    _id: Types.ObjectId;
    name: string;
    description: string;
    avatar?: { public_id?: string; url?: string };
    groupChat: boolean;
    creator?: Types.ObjectId;
    members: Types.ObjectId[];
    createdAt: Date;
    updatedAt: Date;
}

const schema = new Schema<IChat>({
    name: { type: String, required: true },
    description: { type: String, trim: true, maxlength: GROUP_DESCRIPTION_MAX, default: "" },
    avatar: {
        public_id: String,
        url: String,
    },
    groupChat: { type: Boolean, default: false },
    creator: { type: Schema.Types.ObjectId, ref: "User" },
    members: [{ type: Schema.Types.ObjectId, ref: "User" }],
}, { timestamps: true });

// Listing a user's chats by recent activity
schema.index({ members: 1, updatedAt: -1 });

export const Chat = model<IChat>("Chat", schema);
