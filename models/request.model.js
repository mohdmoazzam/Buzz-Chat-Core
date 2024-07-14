import mongoose from "mongoose";
const { Schema, model, models, Types } = mongoose;

const schema = new Schema({
    sender: {
        type: Types.ObjectId,
        ref: "User",
        required: true
    },
    receiver: {
        type: Types.ObjectId,
        ref: "User",
        required: true
    },
    status: {
        type: String,
        default: "pending",
        enum: ["pending", "accepted", "rejected"]
    },
}, { timestamps: true });

export const Request = models.Request || model("Request", schema);