import { compare, hash } from "bcrypt";
import { cookieOptions } from "../constants/constants.js";
import { NEW_REQUEST, REFETCH_CHATS } from "../constants/events.js";
import { TryCatch } from "../middlewares/error.js";
import { Chat } from "../models/chat.model.js";
import { Request } from "../models/request.model.js";
import { User } from "../models/user.model.js";
import { emitEvent, generateToken } from "../utils/features.js";
import { ErrorHandler } from "../utils/utility.js";
import { getOtherMember, uploadFilesToCloudinary } from "../utils/helper.js"


const registerUser = TryCatch(async (req, res, next) => {
    const { name, username, password, bio } = req.body;
    const file = req.file;
    if (!file) {
        return next(new ErrorHandler("Please upload avatar", 400));
    }
    const isUsernameTaken = await User.findOne({ username: username });
    if (isUsernameTaken) {
        return next(new ErrorHandler("Username is not available", 409));
    }
    const response = await uploadFilesToCloudinary([file]);
    const avatar = {
        public_id: response[0].public_id,
        url: response[0].secureUrl
    };
    const hashedPassword = await hash(password, 10);
    const user = await User.create({
        name: name,
        bio: bio,
        username: username,
        password: hashedPassword,
        avatar: avatar
    });
    generateToken(res, user, 201, "User created");
});

const login = TryCatch(async (req, res, next) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username: username }).select("+password");
    if (!user) {
        return next(new ErrorHandler("Invalid username", 404));
    }
    const isPasswordMatch = await compare(password, user.password);
    if (!isPasswordMatch) {
        return next(new ErrorHandler("Invalid password", 401));
    }
    generateToken(res, user, 201, `Welcome back, ${user.name}`);
});

const getUserProfile = TryCatch(async (req, res) => {
    const user = await User.findById({ _id: req.user });
    return res.status(200).json({
        success: true,
        user: user
    });
});

const logout = TryCatch(async (req, res) => {
    return res.status(200)
        .cookie("buzzChat-token", "", { ...cookieOptions, maxAge: 0 })
        .json({
            success: true,
            message: "Log out successfully"
        });
});

const searchUser = TryCatch(async (req, res) => {
    const { name = "" } = req.query;
    const myChats = await Chat.find({ groupChat: false, members: req.user });
    const allUsersFromMyChats = myChats.map((chat) => chat.members).flat();

    const allUsersExceptMeAndFriends = await User.find({
        _id: { $nin: allUsersFromMyChats },
        name: { $regex: name, $options: "i" }
    });
    const users = allUsersExceptMeAndFriends.map(({ _id, name, avatar }) => ({
        _id, name, avatar: avatar.url
    }));
    return res.status(200).json({
        success: true,
        data: users
    });
});

const sendFriendRequest = TryCatch(async (req, res, next) => {
    const { userId } = req.body;
    const request = await Request.findOne({
        $or: [
            { sender: req.user, receiver: userId },
            { sender: userId, receiver: req.user },
        ]
    });

    if (request) {
        return next(new ErrorHandler("Request already sent", 409));
    }

    await Request.create({
        sender: req.user,
        receiver: userId
    });

    emitEvent(req, NEW_REQUEST, [userId]);
    return res.status(201).json({
        success: true,
        message: "Friend request sent"
    });
});

const acceptFriendRequest = TryCatch(async (req, res, next) => {
    const { requestId, accept } = req.body;
    const friendRequest = await Request.findById({ _id: requestId })
        .populate("sender", "name")
        .populate("receiver", "name");

    if (!friendRequest) {
        return next(new ErrorHandler("Invalid requsetId", 404));
    }

    if (friendRequest.receiver._id.toString() !== req.user.toString()) {
        return next(new ErrorHandler("Unauthorized", 401));
    }
    if (!accept) {
        await friendRequest.deleteOne();
        return res.status(200).json({
            success: true,
            message: "Friend request rejected"
        });
    } else {
        const members = [friendRequest.sender._id, friendRequest.receiver._id];
        await Promise.all([
            Chat.create({
                members,
                name: `${friendRequest.sender.name}-${friendRequest.receiver.name}`
            }),
            friendRequest.deleteOne(),
        ]);

        emitEvent(req, REFETCH_CHATS, members);
        return res.status(200).json({
            success: true,
            message: "Request accepted",
            senderId: friendRequest.sender._id
        });
    }
});

const getMyNotifications = TryCatch(async (req, res, next) => {
    const friendRequests = await Request.find({
        receiver: req.user
    }).populate("sender", "name avatar");

    const transformFriendRequests = friendRequests.map(({ _id, sender }) => ({
        _id,
        sender: {
            _id: sender._id,
            name: sender.name,
            avatar: sender.avatar.url
        }
    }));

    return res.status(200).json({
        success: true,
        data: transformFriendRequests
    });
});

const getMyFriends = TryCatch(async (req, res, next) => {
    const chatId = req.query.chatId;
    const chats = await Chat.find({
        members: req.user,
        groupChat: false
    }).populate("members", "name avatar");

    const friends = chats.map(({ members }) => {
        const otherUser = getOtherMember(members, req.user);
        return {
            _id: otherUser._id,
            name: otherUser.name,
            avatar: otherUser.avatar.url
        };
    });

    if (chatId) {
        const chat = await Chat.findById({ _id: chatId });
        if (!chat) {
            return next(new ErrorHandler("Chat not found", 404));
        }
        const availableFriends = friends.filter((friend) => !chat.members.includes(friend._id));
        return res.status(200).json({
            success: true,
            data: availableFriends
        });
    } else {
        return res.status(200).json({
            success: true,
            data: friends
        });
    }
});

export {
    getUserProfile, login, logout, registerUser, searchUser,
    sendFriendRequest, acceptFriendRequest, getMyNotifications,
    getMyFriends
};
