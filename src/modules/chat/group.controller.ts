import { currentUserId, ErrorHandler } from "../../common/errors.js";
import { asyncHandler } from "../../common/middlewares/asyncHandler.js";
import { areValidObjectIds, isValidObjectId, sameId, toIdList } from "../../common/utils/ids.js";
import { deleteFiles, uploadFiles } from "../../common/utils/storage.js";
import { ALERT, REFETCH_CHATS } from "../../socket/events.js";
import { emitToUsers } from "../../socket/index.js";
import { User, type UserSummary } from "../user/user.model.js";
import {
    GROUP_DESCRIPTION_MAX, GROUP_MAX_MEMBERS, GROUP_MIN_MEMBERS, GROUP_NAME_MAX,
} from "./chat.constants.js";
import { Chat, type IChat } from "./chat.model.js";
import {
    assertGroupCreator, findChatForMember, getFriendIds, groupAvatar, isMember, presentMembers,
} from "./chat.service.js";

const alert = (memberIds: Parameters<typeof emitToUsers>[0], chatId: unknown, message: string) =>
    emitToUsers(memberIds, ALERT, { chatId: String(chatId), message });

export const createGroup = asyncHandler(async (req, res, next) => {
    const me = currentUserId(req);
    const name = String(req.body.name ?? "").trim();
    const description = String(req.body.description ?? "").trim();
    // Dedupe and never count the creator twice
    const members = toIdList(req.body.members).filter((id) => !sameId(id, me));

    if (!name || name.length > GROUP_NAME_MAX) {
        return next(new ErrorHandler(`Group name must be 1–${GROUP_NAME_MAX} characters`, 400));
    }
    if (description.length > GROUP_DESCRIPTION_MAX) {
        return next(new ErrorHandler(`Description can be at most ${GROUP_DESCRIPTION_MAX} characters`, 400));
    }
    if (!areValidObjectIds(members)) {
        return next(new ErrorHandler("Invalid member ids", 400));
    }
    if (members.length + 1 < GROUP_MIN_MEMBERS) {
        return next(new ErrorHandler(`Group chat must have at least ${GROUP_MIN_MEMBERS} members`, 400));
    }
    if (members.length + 1 > GROUP_MAX_MEMBERS) {
        return next(new ErrorHandler(`A group can have at most ${GROUP_MAX_MEMBERS} members`, 400));
    }

    // Only friends can be added, so groups can't be used to spam strangers
    const friendIds = await getFriendIds(me);
    if (!members.every((id) => friendIds.has(id))) {
        return next(new ErrorHandler("You can only add your friends to a group", 403));
    }

    let avatar: IChat["avatar"];
    if (req.file) {
        const [uploaded] = await uploadFiles([req.file]);
        avatar = { public_id: uploaded.public_id, url: uploaded.secureUrl };
    }

    const allMembers = [...members, me];
    const chat = await Chat.create({ name, description, avatar, groupChat: true, creator: me, members: allMembers });

    alert(allMembers, chat._id, `Welcome to ${name}`);
    emitToUsers(members, REFETCH_CHATS);

    return res.status(201).json({ success: true, message: "Group created", chatId: chat._id });
});

/** Groups the user created (and can manage). */
export const getMyGroups = asyncHandler(async (req, res) => {
    const me = currentUserId(req);
    const chats = await Chat.find({ members: me, groupChat: true, creator: me })
        .sort({ updatedAt: -1 })
        .populate<{ members: (UserSummary | null)[] }>("members", "name avatar")
        .lean();

    return res.status(200).json({
        success: true,
        groups: chats.map((chat) => {
            const members = presentMembers(chat.members);
            return {
                _id: chat._id,
                groupChat: chat.groupChat,
                name: chat.name,
                description: chat.description,
                memberCount: members.length,
                avatar: groupAvatar(chat, members),
            };
        }),
    });
});

export const addMembers = asyncHandler(async (req, res, next) => {
    const me = currentUserId(req);
    const requested = toIdList(req.body.members);
    if (!requested.length || !areValidObjectIds(requested)) {
        return next(new ErrorHandler("Please select valid members", 400));
    }

    const chat = await findChatForMember(req.body.chatId, me);
    assertGroupCreator(chat, me, "add members");

    const newIds = requested.filter((id) => !isMember(chat, id));
    if (!newIds.length) {
        return next(new ErrorHandler("Everyone selected is already in the group", 400));
    }
    if (chat.members.length + newIds.length > GROUP_MAX_MEMBERS) {
        return next(new ErrorHandler(`A group can have at most ${GROUP_MAX_MEMBERS} members`, 400));
    }

    const friendIds = await getFriendIds(me);
    if (!newIds.every((id) => friendIds.has(id))) {
        return next(new ErrorHandler("You can only add your friends to a group", 403));
    }

    const newUsers = await User.find({ _id: { $in: newIds } }).select("name").lean();
    if (newUsers.length !== newIds.length) {
        return next(new ErrorHandler("Some selected users no longer exist", 400));
    }

    // Atomic add so concurrent requests can't duplicate members
    const updated = await Chat.findOneAndUpdate(
        { _id: chat._id },
        { $addToSet: { members: { $each: newIds } } },
        { new: true }
    );
    const memberIds = updated?.members ?? chat.members;

    const names = newUsers.map((u) => u.name).join(", ");
    alert(memberIds, chat._id, `${names} ${newUsers.length > 1 ? "were" : "was"} added to the group`);
    emitToUsers(memberIds, REFETCH_CHATS);
    return res.status(200).json({ success: true, message: "Members added successfully" });
});

export const removeMember = asyncHandler(async (req, res, next) => {
    const me = currentUserId(req);
    const { userId } = req.body as { userId?: unknown };
    if (!isValidObjectId(userId)) {
        return next(new ErrorHandler("Invalid user", 400));
    }

    const chat = await findChatForMember(req.body.chatId, me);
    assertGroupCreator(chat, me, "remove members");

    if (sameId(userId, me)) {
        return next(new ErrorHandler("Use “Leave group” to remove yourself", 400));
    }
    if (!isMember(chat, userId)) {
        return next(new ErrorHandler("This user is not in the group", 404));
    }
    if (chat.members.length <= GROUP_MIN_MEMBERS) {
        return next(new ErrorHandler(`Group must have at least ${GROUP_MIN_MEMBERS} members`, 400));
    }

    const removedUser = await User.findById(userId).select("name").lean();
    const allMembersBefore = chat.members.map(String);
    chat.members = chat.members.filter((member) => !sameId(member, userId));
    await chat.save();

    alert(chat.members, chat._id, `${removedUser?.name ?? "A member"} was removed from the group`);
    emitToUsers(allMembersBefore, REFETCH_CHATS);

    return res.status(200).json({ success: true, message: "Member removed successfully" });
});

export const leaveGroup = asyncHandler(async (req, res, next) => {
    const me = currentUserId(req);
    const chat = await findChatForMember(req.params.id, me);
    if (!chat.groupChat) {
        return next(new ErrorHandler("This is not a group chat", 400));
    }

    const remainingMembers = chat.members.filter((member) => !sameId(member, me));
    if (remainingMembers.length < GROUP_MIN_MEMBERS) {
        return next(new ErrorHandler(
            `You can't leave: the group needs at least ${GROUP_MIN_MEMBERS} members. Delete it instead.`, 400
        ));
    }

    // Hand admin over to the longest-standing member
    if (sameId(chat.creator, me)) {
        chat.creator = remainingMembers[0];
    }
    chat.members = remainingMembers;
    await chat.save();

    const user = await User.findById(me).select("name").lean();
    alert(chat.members, chat._id, `${user?.name ?? "A member"} left the group`);
    emitToUsers([...chat.members, me], REFETCH_CHATS);

    return res.status(200).json({ success: true, message: "You left the group" });
});

/** Updates a group's name, description and/or picture (admin only). */
export const updateGroup = asyncHandler(async (req, res, next) => {
    const me = currentUserId(req);
    const chat = await findChatForMember(req.params.id, me);
    assertGroupCreator(chat, me, "edit this group");

    const { name, description } = req.body as { name?: unknown; description?: unknown };
    if (name !== undefined) {
        const trimmed = String(name).trim();
        if (!trimmed || trimmed.length > GROUP_NAME_MAX) {
            return next(new ErrorHandler(`Group name must be 1–${GROUP_NAME_MAX} characters`, 400));
        }
        chat.name = trimmed;
    }
    if (description !== undefined) {
        const trimmed = String(description).trim();
        if (trimmed.length > GROUP_DESCRIPTION_MAX) {
            return next(new ErrorHandler(`Description can be at most ${GROUP_DESCRIPTION_MAX} characters`, 400));
        }
        chat.description = trimmed;
    }

    let oldAvatarId: string | undefined;
    if (req.file) {
        const [uploaded] = await uploadFiles([req.file]);
        oldAvatarId = chat.avatar?.public_id;
        chat.avatar = { public_id: uploaded.public_id, url: uploaded.secureUrl };
    }

    await chat.save();
    if (oldAvatarId) deleteFiles([oldAvatarId]);
    emitToUsers(chat.members, REFETCH_CHATS);
    return res.status(200).json({
        success: true,
        message: "Group updated",
        chat: { _id: chat._id, name: chat.name, description: chat.description, avatar: chat.avatar },
    });
});
