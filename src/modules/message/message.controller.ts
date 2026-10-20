import { currentUserId, ErrorHandler } from "../../common/errors.js";
import { asyncHandler } from "../../common/middlewares/asyncHandler.js";
import { uploadFiles } from "../../common/utils/storage.js";
import { findChatForMember } from "../chat/chat.service.js";
import { User, type UserSummary } from "../user/user.model.js";
import { MESSAGES_PAGE_SIZE } from "./message.constants.js";
import { Message } from "./message.model.js";
import { createAndDeliverMessage } from "./message.service.js";

/** Paginated chat history, oldest first within a page. */
export const getMessages = asyncHandler(async (req, res) => {
    const chat = await findChatForMember(req.params.id, currentUserId(req));
    const page = Math.max(1, Number.parseInt(String(req.query.page), 10) || 1);

    const [messages, totalMessages] = await Promise.all([
        Message.find({ chat: chat._id })
            .sort({ createdAt: -1 })
            .skip((page - 1) * MESSAGES_PAGE_SIZE)
            .limit(MESSAGES_PAGE_SIZE)
            .populate<{ sender: UserSummary | null }>("sender", "name")
            .lean(),
        Message.countDocuments({ chat: chat._id }),
    ]);

    return res.status(200).json({
        success: true,
        // Deleted senders show as "Deleted user" instead of crashing the client
        messages: messages.reverse().map((m) => ({ ...m, sender: m.sender ?? { _id: null, name: "Deleted user" } })),
        totalPages: Math.ceil(totalMessages / MESSAGES_PAGE_SIZE),
    });
});

export const sendAttachments = asyncHandler(async (req, res, next) => {
    const me = currentUserId(req);
    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) {
        return next(new ErrorHandler("Please provide attachments", 400));
    }

    const chat = await findChatForMember(req.body.chatId, me);
    const sender = await User.findById(me).select("name").lean();
    const uploaded = await uploadFiles(files);

    const message = await createAndDeliverMessage({
        chatId: chat._id,
        members: chat.members,
        sender: { _id: me, name: sender?.name ?? "" },
        // Keep every uploaded file, not just the first
        attachments: uploaded.map(({ public_id, secureUrl }) => ({ public_id, url: secureUrl })),
    });

    return res.status(200).json({ success: true, message });
});
