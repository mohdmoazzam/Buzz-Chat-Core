import mongoose from "mongoose";
import { userSocketIds } from "../app.js";
import { v2 as cloudinary } from "cloudinary";
import { v4 as uuid } from "uuid"


export const getOtherMember = (members, userId) => {
    return members.find((member) => member._id.toString() !== userId.toString());
};

export const areValidObjectIds = (ids) => {
    return ids.every(id => mongoose.Types.ObjectId.isValid(id));
};

export const getSockets = (users = []) => {
    const sockets = users.map((user) => userSocketIds.get(user.toString())).filter(Boolean);
    return sockets;
};

export const getBase64 = (file) => {
    return `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
};

export const uploadFilesToCloudinary = async (files = []) => {
    const uploadPromises = files.map((file) => {
        return new Promise((resolve, reject) => {
            cloudinary.uploader.upload(getBase64(file), { resource_type: "auto", public_id: uuid() }, (error, result) => {
                if (error) return reject(error);
                resolve(result);
            });
        });
    });
    try {
        const result = await Promise.all(uploadPromises);
        const formattedResult = result.map((res) => {
            return {
                public_id: res.public_id,
                secureUrl: res.secure_url
            };
        });
        return formattedResult;
    } catch (ex) {
        console.error(ex);
    }
};