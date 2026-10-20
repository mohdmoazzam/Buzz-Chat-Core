import { sameId, type Id } from "../../common/utils/ids.js";
import { NEW_MESSAGE, NEW_MESSAGE_ALERT } from "../../socket/events.js";
import { emitToUsers } from "../../socket/index.js";
import { touchChat } from "../chat/chat.service.js";
import { Message, type Attachment } from "./message.model.js";

interface CreateMessageInput {
    chatId: Id;
    members: Id[];
    sender: { _id: Id; name: string };
    content?: string;
    attachments?: Attachment[];
}

/**
 * Persists a message, bumps the chat's activity, and delivers it in real time.
 * Used by both the socket (text) and HTTP (attachments) paths so they behave the same.
 */
export const createAndDeliverMessage = async ({ chatId, members, sender, content = "", attachments = [] }: CreateMessageInput) => {
    // Persist first so the broadcast carries the real id and timestamp
    const message = await Message.create({ content, attachments, sender: sender._id, chat: chatId });
    touchChat(chatId);

    const chatKey = String(chatId);
    emitToUsers(members, NEW_MESSAGE, {
        chatId: chatKey,
        message: {
            _id: message._id,
            content: message.content,
            attachments: message.attachments,
            chat: chatId,
            createdAt: message.createdAt,
            sender: { _id: sender._id, name: sender.name },
        },
    });
    emitToUsers(members.filter((m) => !sameId(m, sender._id)), NEW_MESSAGE_ALERT, { chatId: chatKey });
    return message;
};
