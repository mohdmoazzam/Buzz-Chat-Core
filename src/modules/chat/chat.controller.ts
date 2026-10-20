import type { Types } from "mongoose";
import { currentUserId } from "../../common/errors.js";
import { asyncHandler } from "../../common/middlewares/asyncHandler.js";
import { getOtherMember, sameId } from "../../common/utils/ids.js";
import { paginationMeta, parsePagination, type PaginationOptions } from "../../common/utils/pagination.js";
import { deleteFiles } from "../../common/utils/storage.js";
import { REFETCH_CHATS } from "../../socket/events.js";
import { emitToUsers } from "../../socket/index.js";
import { Message } from "../message/message.model.js";
import type { UserSummary } from "../user/user.model.js";
import { Chat, type IChat } from "./chat.model.js";
import { assertGroupCreator, findChatForMember, groupAvatar, presentMembers } from "./chat.service.js";

interface LastMessagePreview {
    content: string;
    attachments: { url: string }[];
    createdAt: Date;
    sender: { _id: Types.ObjectId | null; name: string };
}

/** Latest message per chat in one aggregation (uses the {chat, createdAt} index). */
const getLastMessages = async (chatIds: Types.ObjectId[]): Promise<Map<string, LastMessagePreview>> => {
    if (!chatIds.length) return new Map();
    const rows = await Message.aggregate<{ _id: Types.ObjectId } & LastMessagePreview>([
        { $match: { chat: { $in: chatIds } } },
        { $sort: { chat: 1, createdAt: -1 } },
        {
            $group: {
                _id: "$chat",
                content: { $first: "$content" },
                attachments: { $first: "$attachments.url" },
                createdAt: { $first: "$createdAt" },
                sender: { $first: "$sender" },
            },
        },
        { $lookup: { from: "users", localField: "sender", foreignField: "_id", as: "senderDoc", pipeline: [{ $project: { name: 1 } }] } },
        {
            $project: {
                content: { $ifNull: ["$content", ""] },
                // Only the URLs are needed to describe the attachment type
                attachments: { $map: { input: { $ifNull: ["$attachments", []] }, as: "url", in: { url: "$$url" } } },
                createdAt: 1,
                sender: {
                    _id: { $ifNull: [{ $first: "$senderDoc._id" }, null] },
                    name: { $ifNull: [{ $first: "$senderDoc.name" }, "Deleted user"] },
                },
            },
        },
    ]);
    return new Map(rows.map(({ _id, ...preview }) => [String(_id), preview]));
};

const CHAT_LIST_PAGINATION = {
    allowedOrderBy: ["updatedAt", "createdAt"] as const,
    defaultOrderBy: "updatedAt",
    defaultOrder: "desc",
    defaultTake: 20,
    maxTake: 100,
} satisfies PaginationOptions<"updatedAt" | "createdAt">;

/**
 * Chats the user is in, with a last-message preview.
 * Query: ?page=1&take=20&orderBy=updatedAt&order=desc (updatedAt = latest activity).
 */
export const getMyChats = asyncHandler(async (req, res) => {
    const me = currentUserId(req);
    const { page, take, skip, sort } = parsePagination(req.query, CHAT_LIST_PAGINATION);

    const [chats, total] = await Promise.all([
        Chat.find({ members: me })
            .sort(sort)
            .skip(skip)
            .limit(take)
            .populate<{ members: (UserSummary | null)[] }>("members", "name avatar")
            .lean(),
        Chat.countDocuments({ members: me }),
    ]);

    const lastMessages = await getLastMessages(chats.map((chat) => chat._id));

    const transformedChats = chats.flatMap((chat) => {
        const members = presentMembers(chat.members);
        const otherMember = getOtherMember(members, me);
        // A 1:1 chat whose other member was deleted has nothing to show
        if (!chat.groupChat && !otherMember) return [];
        return [{
            _id: chat._id,
            groupChat: chat.groupChat,
            avatar: chat.groupChat ? groupAvatar(chat, members) : [otherMember?.avatar?.url],
            name: chat.groupChat ? chat.name : otherMember?.name,
            members: members.filter((m) => !sameId(m._id, me)).map((m) => m._id),
            lastMessage: lastMessages.get(String(chat._id)) ?? null,
        }];
    });

    return res.status(200).json({
        success: true,
        chats: transformedChats,
        pagination: paginationMeta(page, take, total),
    });
});

export const getChatDetails = asyncHandler(async (req, res) => {
    const chat = await findChatForMember(req.params.id, currentUserId(req));

    if (req.query.populate !== "true") {
        return res.status(200).json({ success: true, chat });
    }

    const populated = await chat.populate<{ members: (UserSummary | null)[] }>("members", "name username avatar");
    // toObject() drops the populated typing, so restore it explicitly
    const result = populated.toObject() as unknown as Omit<IChat, "members"> & { members: (UserSummary | null)[] };
    return res.status(200).json({
        success: true,
        chat: {
            ...result,
            members: presentMembers(result.members).map((member) => ({
                _id: member._id,
                name: member.name,
                username: member.username,
                avatar: member.avatar?.url,
            })),
        },
    });
});

/** Deletes a 1:1 chat (any member) or a group (admin only), with its messages and files. */
export const deleteChat = asyncHandler(async (req, res) => {
    const me = currentUserId(req);
    const chat = await findChatForMember(req.params.id, me);
    if (chat.groupChat) {
        assertGroupCreator(chat, me, "delete the group");
    }

    const members = chat.members.map(String);
    const messagesWithAttachments = await Message.find({ chat: chat._id, "attachments.0": { $exists: true } })
        .select("attachments.public_id")
        .lean();
    const publicIds = [
        chat.avatar?.public_id,
        ...messagesWithAttachments.flatMap(({ attachments }) => attachments.map((a) => a.public_id)),
    ];

    await Promise.all([chat.deleteOne(), Message.deleteMany({ chat: chat._id })]);
    // File cleanup can be slow; don't make the user wait for it
    deleteFiles(publicIds);

    emitToUsers(members, REFETCH_CHATS);
    return res.status(200).json({ success: true, message: chat.groupChat ? "Group deleted" : "Chat deleted" });
});
