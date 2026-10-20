import { model, Schema, type Types } from "mongoose";
import { MESSAGE_MAX } from "./message.constants.js";

export interface Attachment {
    public_id: string;
    url: string;
}

export interface IMessage {
    _id: Types.ObjectId;
    sender: Types.ObjectId;
    chat: Types.ObjectId;
    content?: string;
    attachments: Attachment[];
    createdAt: Date;
    updatedAt: Date;
}

const schema = new Schema<IMessage>({
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
    chat: { type: Schema.Types.ObjectId, ref: "Chat", required: true },
    content: { type: String, maxlength: MESSAGE_MAX },
    attachments: [
        {
            public_id: { type: String, required: true },
            url: { type: String, required: true },
        },
    ],
}, { timestamps: true });

// Paginating a chat's history newest-first
schema.index({ chat: 1, createdAt: -1 });

export const Message = model<IMessage>("Message", schema);
