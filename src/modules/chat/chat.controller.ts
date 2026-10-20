import { currentUserId } from "../../common/errors.js";
import { asyncHandler } from "../../common/middlewares/asyncHandler.js";
import { getOtherMember, sameId } from "../../common/utils/ids.js";
import { deleteFiles } from "../../common/utils/storage.js";
import { REFETCH_CHATS } from "../../socket/events.js";
import { emitToUsers } from "../../socket/index.js";
import { Message } from "../message/message.model.js";
import type { UserSummary } from "../user/user.model.js";
import { Chat, type IChat } from "./chat.model.js";
import { assertGroupCreator, findChatForMember, groupAvatar, presentMembers } from "./chat.service.js";

/** All chats the user is in, most recently active first. */
export const getMyChats = asyncHandler(async (req, res) => {
    const me = currentUserId(req);
    const chats = await Chat.find({ members: me })
        .sort({ updatedAt: -1 })
        .populate<{ members: (UserSummary | null)[] }>("members", "name avatar")
        .lean();

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
        }];
    });

    return res.status(200).json({ success: true, chats: transformedChats });
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
