import { TryCatch } from "../middlewares/error.js";
import { ErrorHandler } from "../utils/utility.js";
import { Chat } from "../models/chat.model.js";
import { User } from "../models/user.model.js";
import { Message } from "../models/message.model.js";
import { deleteFilesFromCloudinary, emitEvent } from "../utils/features.js";
import { ALERT, NEW_MESSAGE, NEW_MESSAGE_ALERT, REFETCH_CHATS } from "../constants/events.js";
import { areValidObjectIds, getOtherMember, uploadFilesToCloudinary } from "../utils/helper.js";

const newGroupChat = TryCatch(async (req, res, next) => {
    const { name, members } = req.body;
    if (members.length < 2) {
        return next(new ErrorHandler("Group chat must have at least 3 members", 409));
    }

    const allMemebers = [...members, req.user];
    await Chat.create({
        name: name,
        groupChat: true,
        creator: req.user,
        members: allMemebers
    });

    emitEvent(req, ALERT, allMemebers, `Welcome to ${name} group`);
    emitEvent(req, REFETCH_CHATS, members);

    return res.status(201).json({
        success: true,
        message: "Group created"
    });
});

const getMyChats = TryCatch(async (req, res, next) => {
    const chats = await Chat.find({ members: req.user }).populate("members", "name avatar");
    const transformedChats = chats.map(({ _id, name, members, groupChat }) => {
        const otherMember = getOtherMember(members, req.user);
        return {
            _id: _id,
            groupChat: groupChat,
            avatar: groupChat ? members.slice(0, 3).map(({ avatar }) => avatar.url) : [otherMember.avatar.url],
            name: groupChat ? name : otherMember.name,
            members: members.reduce((prev, curr) => {
                if (curr._id.toString() !== req.user.toString()) {
                    prev.push(curr._id);
                }
                return prev;
            }, [])
        };
    });

    return res.status(200).json({
        success: true,
        chats: transformedChats
    });
});

const getMyGroups = TryCatch(async (req, res, next) => {
    const query = await Chat.find({
        members: req.user,
        groupChat: true,
        creator: req.user
    }).populate("members", "name avatar");

    const groups = query.map(({ members, _id, groupChat, name }) => {
        return {
            _id: _id,
            groupChat: groupChat,
            name: name,
            avatar: members.slice(0, 3).map(({ avatar }) => avatar.url)
        };
    });
    return res.status(200).json({
        success: true,
        groups: groups
    });
});

const addMembers = TryCatch(async (req, res, next) => {
    const { chatId, members } = req.body;
    if (!Array.isArray(members) || !areValidObjectIds(members)) {
        return next(new ErrorHandler("Ids must be mongodb id", 409));
    }
    const chat = await Chat.findById({ _id: chatId });
    if (!chat) {
        return next(new ErrorHandler("Chat not found", 404));
    }

    if (!chat.groupChat) {
        return next(new ErrorHandler("This is not a group chat", 409));
    }

    if (chat.creator.toString() !== req.user.toString()) {
        return next(new ErrorHandler("You are not allowed to add members", 403));
    }

    const allNewMembersPromise = members.map((member) => User.findById({ _id: member }));
    const allNewMember = await Promise.all(allNewMembersPromise);

    const uniqueMembers = allNewMember.filter((a) => !chat.members.includes(a._id.toString())).map((i) => i._id);

    chat.members.push(...uniqueMembers);
    if (chat.members.length > 15) {
        return next(new ErrorHandler("Group member limit reached", 400));
    }
    await chat.save();
    const allUsersName = allNewMember.map((a) => a.name).join(",");
    emitEvent(req, ALERT, chat.members, `${allUsersName} has been added in the group`);
    emitEvent(req, REFETCH_CHATS, chat.members);
    return res.status(200).json({
        success: true,
        message: "Members added successfully"
    });
});

const removeMember = TryCatch(async (req, res, next) => {
    const { userId, chatId } = req.body;
    const [chat, userToRemoved] = await Promise.all([
        Chat.findById({ _id: chatId }),
        User.findById({ _id: userId })
    ]);
    if (!chat) {
        return next(new ErrorHandler("Chat not found", 404));
    }

    if (!chat.groupChat) {
        return next(new ErrorHandler("This is not a group chat", 409));
    }

    if (chat.creator.toString() !== req.user.toString()) {
        return next(new ErrorHandler("You are not allowed to remove members", 403));
    }

    if (chat.members.length <= 3) {
        return next(new ErrorHandler("Group must have atleast 3 members", 403));
    }

    const allChatMembers = chat.members.map((i) => i.toString());

    chat.members = chat.members.filter((member) => member.toString() !== userId.toString());

    await chat.save();

    emitEvent(req, ALERT, chat.members, {
        message: `${userToRemoved?.name} has been removed from the group`,
        chatId: chatId
    });

    emitEvent(req, REFETCH_CHATS, allChatMembers);

    return res.status(200).json({
        success: true,
        message: "Member removed successfully"
    });
});

const leaveGroup = TryCatch(async (req, res, next) => {
    const chatId = req.params.id;
    const chat = await Chat.findById({ _id: chatId });

    if (!chat) {
        return next(new ErrorHandler("Chat not found", 404));
    }

    if (!chat.groupChat) {
        return next(new ErrorHandler("This is not a group chat", 409));
    }
    const remainingMembers = chat.members.filter((member) => member.toString() !== req.user.toString());
    if (remainingMembers.length < 3) {
        return next(new ErrorHandler("Group must have atleast 3 members", 400));
    }
    if (chat.creator.toString() === req.user.toString()) {
        const randomeIndex = Math.floor(Math.random() * remainingMembers.length);
        const newCreator = remainingMembers[randomeIndex];
        chat.creator = newCreator
    }

    chat.members = remainingMembers;
    const user = await User.findById({ _id: req.user });
    await chat.save();

    emitEvent(req, ALERT, chat.members, {
        message: `User ${user.name} has left the group chat`,
        chatId: chatId
    });
    
    return res.status(200).json({
        success: true,
        message: "Leave group Successfully"
    });
});

const sendAttachments = TryCatch(async (req, res, next) => {
    const { chatId } = req.body;
    const [chat, me] = await Promise.all([
        Chat.findById({ _id: chatId }),
        User.findById({ _id: req.user })
    ]);
    if (!chat) {
        return next(new ErrorHandler("Chat not found", 404));
    }
    const files = req.files || [];
    if (files.length < 1) {
        return next(new ErrorHandler("Please provide attachments", 400));
    }
    const attachments = await uploadFilesToCloudinary(files);

    const messageForDb = {
        content: "",
        attachments: [{
            public_id: attachments[0].public_id,
            url: attachments[0].secureUrl
        }],
        sender: me._id,
        chat: chatId
    };
    const messageForRealTime = {
        ...messageForDb,
        sender: {
            _id: me._id,
            name: me.name
        }
    };
    const message = await Message.create(messageForDb);
    emitEvent(req, NEW_MESSAGE, chat.members, {
        message: messageForRealTime,
        chatId
    });
    emitEvent(req, NEW_MESSAGE_ALERT, chat.members, { chatId });

    return res.status(200).json({
        success: true,
        message: message
    });
});

const getChatDetails = TryCatch(async (req, res, next) => {
    if (req.query.populate === "true") {
        const chat = await Chat.findById(req.params.id).populate("members", "name avatar").lean();
        if (!chat) {
            return next(new ErrorHandler("Chat not found", 404));
        }
        chat.members = chat.members.map(member => {
            return {
                _id: member._id,
                name: member.name,
                avatar: member.avatar.url
            };
        });
        return res.status(200).json({
            success: true,
            chat: chat
        });
    } else {
        const chat = await Chat.findById(req.params.id);
        if (!chat) {
            return next(new ErrorHandler("Chat not found", 404));
        }
        return res.status(200).json({
            success: true,
            chat: chat
        });
    }
});

const renameGroup = TryCatch(async (req, res, next) => {
    const chatId = req.params.id;
    const { name } = req.body;
    const chat = await Chat.findById({ _id: chatId });
    if (!chat) {
        return next(new ErrorHandler("Chat not found", 404));
    }
    if (!chat.groupChat) {
        return next(new ErrorHandler("This is not a group chat", 400));
    }
    if (chat.creator.toString() !== req.user.toString()) {
        return next(new ErrorHandler("You are not allowed to rename group", 403));
    }
    chat.name = name;
    await chat.save();
    emitEvent(req, REFETCH_CHATS, chat.members);
    return res.status(200).json({
        success: true,
        message: "Group renamed successfully"
    });
});

const deletChat = TryCatch(async (req, res, next) => {
    const chatId = req.params.id;
    const chat = await Chat.findById({ _id: chatId });
    if (!chat) {
        return next(new ErrorHandler("Chat not found", 404));
    }
    const members = chat.members;
    if (chat.groupChat && chat.creator.toString() !== req.user.toString()) {
        return next(new ErrorHandler("You are not allowed to delete the group", 403));
    }

    if (chat.groupChat && !chat.members.includes(req.user.toString())) {
        return next(new ErrorHandler("You are not allowed to delete the group", 403));
    }
    const messagesWithAttachments = await Message.find({
        chat: chatId,
        attachments: { $exists: true, $ne: [] }
    });
    const publicIds = [];
    messagesWithAttachments.forEach(({ attachments }) => {
        attachments.forEach(({ public_id }) => {
            publicIds.push(public_id);
        });
    });

    await Promise.all([
        deleteFilesFromCloudinary(publicIds),
        chat.deleteOne(),
        Message.deleteMany({ chat: chatId })
    ]);
    emitEvent(req, REFETCH_CHATS, members);
    return res.status(200).json({
        success: true,
        message: "Chat deleted successfully"
    });
});

const getMessages = TryCatch(async (req, res, next) => {
    const chatId = req.params.id;
    const { page = 1 } = req.query;

    const limit = 20;
    const skip = (page - 1) * limit;

    const chat = await Chat.findById({ _id: chatId });

    if (!chat) {
        return next(new ErrorHandler("Chat not found", 404));
    }

    if (!chat.members.includes(req.user.toString())) {
        return next(new ErrorHandler("Forbidden", 403));
    }

    const messages = await Message.find({ chat: chatId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("sender", "name")
        .lean();

    const totalMessages = await Message.countDocuments({ chat: chatId });
    const totalPages = Math.ceil(totalMessages / limit);

    return res.status(200).json({
        success: true,
        messages: messages.reverse(),
        totalPages: totalPages
    });
});

export {
    newGroupChat,
    getMyChats,
    getMyGroups,
    addMembers,
    removeMember,
    leaveGroup,
    sendAttachments,
    getChatDetails,
    renameGroup,
    deletChat,
    getMessages
};