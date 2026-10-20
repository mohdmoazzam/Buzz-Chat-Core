import { createHash, timingSafeEqual } from "crypto";
import { config } from "../../config/env.js";
import { ADMIN_COOKIE, cookieOptions } from "../../common/constants.js";
import { ErrorHandler } from "../../common/errors.js";
import { asyncHandler } from "../../common/middlewares/asyncHandler.js";
import type { Id } from "../../common/utils/ids.js";
import { signAdminToken } from "../../common/utils/token.js";
import { Chat } from "../chat/chat.model.js";
import { presentMembers } from "../chat/chat.service.js";
import { Message } from "../message/message.model.js";
import { User, type UserSummary } from "../user/user.model.js";

const sha256 = (value: string) => createHash("sha256").update(value).digest();

export const adminLogin = asyncHandler(async (req, res, next) => {
    const { secretKey } = req.body as { secretKey?: unknown };
    const expected = config.adminSecretKey;
    const isMatched =
        !!expected && typeof secretKey === "string" && timingSafeEqual(sha256(secretKey), sha256(expected));
    if (!isMatched) {
        return next(new ErrorHandler("Invalid admin key", 401));
    }

    // The token only carries a role claim; it never contains the secret itself
    const token = signAdminToken();
    return res.status(200)
        .cookie(ADMIN_COOKIE, token, { ...cookieOptions, maxAge: config.adminTokenTtlSeconds * 1000 })
        .json({ success: true, admin_token: token, message: "Authenticated successfully" });
});

export const adminLogout = asyncHandler(async (_req, res) => {
    return res.status(200)
        .cookie(ADMIN_COOKIE, "", { ...cookieOptions, maxAge: 0 })
        .json({ success: true, message: "Logged out successfully" });
});

export const getAdminData = asyncHandler(async (_req, res) => {
    return res.status(200).json({ admin: true });
});

export const getAllUsers = asyncHandler(async (_req, res) => {
    // One aggregation instead of two count queries per user
    const [users, counts] = await Promise.all([
        User.find({}).select("name username avatar").lean(),
        Chat.aggregate<{ _id: { member: Id; group: boolean }; count: number }>([
            { $unwind: "$members" },
            { $group: { _id: { member: "$members", group: "$groupChat" }, count: { $sum: 1 } } },
        ]),
    ]);

    const countFor = new Map(counts.map(({ _id, count }) => [`${_id.member}:${_id.group}`, count]));
    return res.status(200).json({
        success: true,
        data: users.map(({ _id, name, username, avatar }) => ({
            _id,
            name,
            username,
            avatar: avatar?.url,
            group: countFor.get(`${_id}:true`) ?? 0,
            friends: countFor.get(`${_id}:false`) ?? 0,
        })),
    });
});

export const getAllChats = asyncHandler(async (_req, res) => {
    const [chats, messageCounts] = await Promise.all([
        Chat.find({})
            .populate<{ members: (UserSummary | null)[]; creator: UserSummary | null }>([
                { path: "members", select: "name avatar" },
                { path: "creator", select: "name avatar" },
            ])
            .lean(),
        Message.aggregate<{ _id: Id; count: number }>([{ $group: { _id: "$chat", count: { $sum: 1 } } }]),
    ]);
    const totalFor = new Map(messageCounts.map(({ _id, count }) => [String(_id), count]));

    return res.status(200).json({
        success: true,
        data: chats.map(({ members: rawMembers, _id, groupChat, name, creator }) => {
            const members = presentMembers(rawMembers);
            return {
                _id,
                groupChat,
                name,
                avatar: members.slice(0, 3).map((member) => member.avatar?.url),
                members: members.map((member) => ({ _id: member._id, name: member.name, avatar: member.avatar?.url })),
                creator: {
                    _id: creator?._id ?? "NA",
                    name: creator?.name ?? "NA",
                    avatar: creator?.avatar?.url ?? "",
                },
                totalMembers: members.length,
                totalMessages: totalFor.get(String(_id)) ?? 0,
            };
        }),
    });
});

export const getAllMessages = asyncHandler(async (_req, res) => {
    const messages = await Message.find({})
        .sort({ createdAt: -1 })
        .limit(1000)
        .populate<{ sender: UserSummary | null; chat: { _id: Id; groupChat: boolean } | null }>([
            { path: "sender", select: "name avatar" },
            { path: "chat", select: "groupChat" },
        ])
        .lean();

    return res.status(200).json({
        success: true,
        data: messages.map(({ content, attachments, _id, sender, createdAt, chat }) => ({
            _id,
            attachments,
            content,
            createdAt,
            chat: chat?._id ?? null,
            groupChat: chat?.groupChat ?? false,
            sender: {
                _id: sender?._id ?? null,
                name: sender?.name ?? "Deleted user",
                avatar: sender?.avatar?.url ?? "",
            },
        })),
    });
});

export const getDashboardStats = asyncHandler(async (_req, res) => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const since = new Date(startOfToday.getTime() - 6 * DAY_MS);

    const [groupsCount, usersCount, messagesCount, totalChatsCount, recent] = await Promise.all([
        Chat.countDocuments({ groupChat: true }),
        User.countDocuments(),
        Message.countDocuments(),
        Chat.countDocuments(),
        Message.find({ createdAt: { $gte: since } }).select("createdAt").lean(),
    ]);

    // Index 6 = today, 0 = six days ago (matches the dashboard chart labels)
    const messagesChart: number[] = new Array(7).fill(0);
    const endOfToday = startOfToday.getTime() + DAY_MS - 1;
    recent.forEach(({ createdAt }) => {
        const daysAgo = Math.floor((endOfToday - createdAt.getTime()) / DAY_MS);
        if (daysAgo >= 0 && daysAgo < 7) messagesChart[6 - daysAgo]++;
    });

    return res.status(200).json({
        success: true,
        data: { groupsCount, usersCount, messagesCount, totalChatsCount, messagesChart },
    });
});
