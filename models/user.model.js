import mongoose from "mongoose";
const { Schema, model, models } = mongoose;

const schema = new Schema({
    name: {
        type: String,
        required: true
    },
    bio: {
        type: String,
        required: true
    },
    username: {
        type: String,
        required: true,
        unique: true
    },
    gender: {
        type: String,
        enum: ["male", "female", "other", "prefer_not_to_say"]
    },
    phone: {
        type: String,
        trim: true
    },
    password: {
        type: String,
        required: true,
        select: false
    },
    avatar: {
        public_id: {
            type: String,
            required: true
        },
        url: {
            type: String,
            required: true
        }
    }
}, { timestamps: true });

export const User = models.User || model("User", schema);