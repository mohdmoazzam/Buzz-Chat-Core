import jwt from "jsonwebtoken";
import { AppConfig, cookieOptions } from "../constants/constants.js";
import { TryCatch } from "../middlewares/error.js";
import { Chat } from "../models/chat.model.js";
import { Message } from "../models/message.model.js";
import { User } from "../models/user.model.js";
import { ErrorHandler } from "../utils/utility.js";

const adminLogin = TryCatch(async (req, res, next) => {
    const { secretKey } = req.body;
    const adminSecretKey = process.env.ADMIN_SECRET_KEY;
    const isMatched = !!adminSecretKey && secretKey === adminSecretKey;
    if (!isMatched) {
        return next(new ErrorHandler("Invalid admin key", 401));
    } else {
        const token = jwt.sign(secretKey, AppConfig.JWT_SECRET);
        return res.status(201)
            .cookie(AppConfig.ADMIN_TOKEN_NAME, token, { ...cookieOptions, maxAge: 1000 * 60 * 15 })
            .json({
                success: true,
                admin_token: token,
                message: "Authenticated successfully"
            });
    }
});

const adminLogout = TryCatch(async (req, res, next) => {
    return res.status(201)
        .cookie("buzzChat-admin-token", "", { ...cookieOptions, maxAge: 0 })
        .json({
            success: true,
            message: "Logget out successfully"
        });
});

const getAdminData = TryCatch(async (req, res, next) => {
    return res.status(200).json({
        admin: true
    });
});

const getAllUsers = TryCatch(async (req, res) => {
    const users = await User.find({});
    const transformUsers = await Promise.all(
        users.map(async ({_id, name, username, avatar }) => {
            const [group, friends] = await Promise.all([
                Chat.countDocuments({ groupChat: true, members: _id }),
                Chat.countDocuments({ groupChat: false, members: _id })
            ])
            return {
                _id,
                name,
                username,
                avatar: avatar.url,
                group,
                friends
            }
        })
    );
    return res.status(200).json({
        success: true,
        data: transformUsers
    });
});

const getAllChats = TryCatch(async (req, res) => {
    const chats = await Chat.find({})
        .populate("members", "name avatar")
        .populate("creator", "name avatar");

    const transformedChats = await Promise.all(chats.map(async ({ members, _id, groupChat, name, creator }) => {
        const totalMessages = await Message.countDocuments({ chat: _id })
        return {
            _id,
            groupChat,
            name,
            avatar: members.slice(0, 3).map((member) => member.avatar.url),
            members: members.map((member) => {
                return {
                    _id: member._id,
                    name: member.name,
                    avatar: member.avatar.url
                };
            }),
            creator: {
                _id: creator?._id || "NA",
                name: creator?.name || "NA",
                avatar: creator?.avatar.url || ""
            },
            totalMembers: members.length,
            totalMessages
        };
    }));
    return res.status(200).json({
        success: true,
        data: transformedChats
    });
});

const getAllMessages = TryCatch(async (req, res) => {
    const messages = await Message.find({})
        .populate("sender", "name avatar")
        .populate("chat", "groupChat");

    const transformedMessages = messages.map(({ content, attachments, _id, sender, createdAt, chat }) => {
        return {
            _id,
            attachments,
            content,
            createdAt,
            chat: chat._id,
            groupChat: chat.groupChat,
            sender: {
                _id: sender._id,
                name: sender.name,
                avatar: sender.avatar.url
            }
        };
    })
    return res.status(200).json({
        success: true,
        data: transformedMessages
    });
});

const getDashboardStats = TryCatch(async (req, res) => {
    const [groupsCount, usersCount, messagesCount, totalChatsCount] = await Promise.all([
        Chat.countDocuments({ groupChat: true }),
        User.countDocuments(),
        Message.countDocuments(),
        Chat.countDocuments(),
    ]);

    const today = new Date();
    const last7Days = new Date();
    last7Days.setDate(last7Days.getDate() - 7);
    const last7DaysMessages = await Message.find({
        createdAt: {
            $gte: last7Days,
            $lte: today
        }
    }).select("createdAt");

    const messages = new Array(7).fill(0);
    last7DaysMessages.forEach(message => {
        const index = Math.floor((today.getTime() - message.createdAt.getTime()) / (1000 * 60 * 60 * 24));
        if (index >= 0 && index < 7) messages[6 - index]++;
    })
    const stats = {
        groupsCount,
        usersCount,
        messagesCount,
        totalChatsCount,
        messagesChart: messages
    };
    return res.status(200).json({
        success: true,
        data: stats
    });
});

export {
    adminLogin,
    adminLogout,
    getAdminData, getAllChats,
    getAllMessages, getAllUsers, getDashboardStats
};
