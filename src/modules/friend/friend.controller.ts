import type { FilterQuery } from "mongoose";
import { currentUserId, ErrorHandler, isDuplicateKeyError } from "../../common/errors.js";
import { asyncHandler } from "../../common/middlewares/asyncHandler.js";
import { getOtherMember, isValidObjectId, sameId } from "../../common/utils/ids.js";
import { escapeRegex } from "../../common/utils/regex.js";
import { NEW_REQUEST, REFETCH_CHATS } from "../../socket/events.js";
import { emitToUsers } from "../../socket/index.js";
import { Chat } from "../chat/chat.model.js";
import { getFriendIds, presentMembers } from "../chat/chat.service.js";
import { User, type IUser, type UserSummary } from "../user/user.model.js";
import { Request } from "./request.model.js";

/** People the user isn't friends with yet, with any pending request state. */
export const searchUsers = asyncHandler(async (req, res) => {
    const me = currentUserId(req);
    const query = String(req.query.name ?? "").trim().slice(0, 50);
    const friendIds = await getFriendIds(me);

    const filter: FilterQuery<IUser> = { _id: { $nin: [...friendIds, me] } };
    if (query) {
        const pattern = { $regex: escapeRegex(query), $options: "i" };
        filter.$or = [{ name: pattern }, { username: pattern }];
    }

    const [users, pendingRequests] = await Promise.all([
        User.find(filter).select("name username avatar").sort({ name: 1 }).limit(30).lean(),
        Request.find({ $or: [{ sender: me }, { receiver: me }] }).select("sender receiver").lean(),
    ]);

    // "sent" = I already requested them, "received" = they requested me
    const requestStatus = new Map<string, "sent" | "received">();
    pendingRequests.forEach(({ sender, receiver }) => {
        if (sameId(sender, me)) requestStatus.set(String(receiver), "sent");
        else requestStatus.set(String(sender), "received");
    });

    return res.status(200).json({
        success: true,
        data: users.map(({ _id, name, username, avatar }) => ({
            _id,
            name,
            username,
            avatar: avatar?.url,
            requestStatus: requestStatus.get(String(_id)) ?? null,
        })),
    });
});

export const sendRequest = asyncHandler(async (req, res, next) => {
    const me = currentUserId(req);
    const { userId } = req.body as { userId?: unknown };

    if (!isValidObjectId(userId)) {
        return next(new ErrorHandler("Invalid user", 400));
    }
    if (sameId(userId, me)) {
        return next(new ErrorHandler("You can't send a request to yourself", 400));
    }

    const [target, existingRequest, existingChat] = await Promise.all([
        User.exists({ _id: userId }),
        Request.exists({ $or: [{ sender: me, receiver: userId }, { sender: userId, receiver: me }] }),
        Chat.exists({ groupChat: false, members: { $all: [me, userId] } }),
    ]);

    if (!target) return next(new ErrorHandler("User not found", 404));
    if (existingChat) return next(new ErrorHandler("You're already friends", 409));
    if (existingRequest) return next(new ErrorHandler("Request already sent", 409));

    try {
        await Request.create({ sender: me, receiver: userId });
    } catch (error) {
        if (isDuplicateKeyError(error)) return next(new ErrorHandler("Request already sent", 409));
        throw error;
    }

    emitToUsers([userId], NEW_REQUEST);
    return res.status(201).json({ success: true, message: "Friend request sent" });
});

/** Accepts or declines a request addressed to the current user. */
export const respondToRequest = asyncHandler(async (req, res, next) => {
    const me = currentUserId(req);
    const { requestId } = req.body as { requestId?: unknown };
    const accept = req.body.accept === true || req.body.accept === "true";

    if (!isValidObjectId(requestId)) {
        return next(new ErrorHandler("Invalid request", 400));
    }

    const friendRequest = await Request.findById(requestId)
        .populate<{ sender: UserSummary | null; receiver: UserSummary | null }>([
            { path: "sender", select: "name" },
            { path: "receiver", select: "name" },
        ]);

    // Only the receiver may respond; everyone else gets the same "not found"
    if (!friendRequest || !friendRequest.receiver || !sameId(friendRequest.receiver._id, me)) {
        return next(new ErrorHandler("Request not found", 404));
    }

    if (!accept) {
        await friendRequest.deleteOne();
        return res.status(200).json({ success: true, message: "Friend request declined" });
    }

    // Sender may have deleted their account since sending
    if (!friendRequest.sender) {
        await friendRequest.deleteOne();
        return next(new ErrorHandler("This user no longer exists", 410));
    }

    const { sender, receiver } = friendRequest;
    const members = [sender._id, receiver._id];
    const alreadyFriends = await Chat.exists({ groupChat: false, members: { $all: members } });
    if (!alreadyFriends) {
        await Chat.create({ members, name: `${sender.name}-${receiver.name}` });
    }
    // Clear requests in both directions
    await Request.deleteMany({
        $or: [
            { sender: members[0], receiver: members[1] },
            { sender: members[1], receiver: members[0] },
        ],
    });

    emitToUsers(members, REFETCH_CHATS);
    return res.status(200).json({ success: true, message: "Request accepted", senderId: sender._id });
});

/** Pending friend requests sent to the current user. */
export const getNotifications = asyncHandler(async (req, res) => {
    const friendRequests = await Request.find({ receiver: currentUserId(req) })
        .sort({ createdAt: -1 })
        .populate<{ sender: UserSummary | null }>("sender", "name avatar")
        .lean();

    return res.status(200).json({
        success: true,
        // Skip requests whose sender has since been deleted
        data: friendRequests.flatMap(({ _id, sender }) =>
            sender ? [{ _id, sender: { _id: sender._id, name: sender.name, avatar: sender.avatar?.url } }] : []
        ),
    });
});

/** Friends, optionally excluding those already in `?chatId=` (for "add members"). */
export const getFriends = asyncHandler(async (req, res, next) => {
    const me = currentUserId(req);
    const { chatId } = req.query;

    const chats = await Chat.find({ members: me, groupChat: false })
        .populate<{ members: (UserSummary | null)[] }>("members", "name avatar")
        .lean();

    const friends = chats
        .map(({ members }) => getOtherMember(presentMembers(members), me))
        .filter((friend): friend is UserSummary => Boolean(friend))
        .map((friend) => ({ _id: friend._id, name: friend.name, avatar: friend.avatar?.url }));

    if (!chatId) {
        return res.status(200).json({ success: true, data: friends });
    }
    if (!isValidObjectId(chatId)) {
        return next(new ErrorHandler("Invalid chat", 400));
    }

    const chat = await Chat.findOne({ _id: chatId, members: me }).select("members").lean();
    if (!chat) {
        return next(new ErrorHandler("Chat not found", 404));
    }
    const inChat = new Set(chat.members.map(String));
    return res.status(200).json({
        success: true,
        data: friends.filter((friend) => !inChat.has(String(friend._id))),
    });
});
