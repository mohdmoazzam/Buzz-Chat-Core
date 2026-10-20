import { model, Schema, type Types } from "mongoose";

export interface IRequest {
    _id: Types.ObjectId;
    sender: Types.ObjectId;
    receiver: Types.ObjectId;
    status: "pending" | "accepted" | "rejected";
    createdAt: Date;
    updatedAt: Date;
}

const schema = new Schema<IRequest>({
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
    receiver: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, default: "pending", enum: ["pending", "accepted", "rejected"] },
}, { timestamps: true });

// One request per direction; lookups by receiver for notifications
schema.index({ sender: 1, receiver: 1 }, { unique: true });
schema.index({ receiver: 1, createdAt: -1 });

export const Request = model<IRequest>("Request", schema);
