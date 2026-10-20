import type { Socket } from "socket.io";
import { isValidObjectId, sameId } from "../common/utils/ids.js";
import { Chat } from "../modules/chat/chat.model.js";
import { MESSAGE_MAX } from "../modules/message/message.constants.js";
import { createAndDeliverMessage } from "../modules/message/message.service.js";
import type { SocketUser } from "./auth.js";
import { CHAT_JOINED, CHAT_LEAVED, NEW_MESSAGE, START_TYPING, STOP_TYPING } from "./events.js";
import { emitToUsers, userRoom } from "./index.js";
import { refreshPresence, userConnected, userDisconnected } from "./presence.js";

type Ack = (response: { ok: boolean; error?: string; messageId?: string }) => void;

// Server-side membership check: never trust chatId/members sent by the client
const loadChatForMember = async (chatId: unknown, userId: string) => {
    if (!isValidObjectId(chatId)) return null;
    return Chat.findOne({ _id: chatId, members: userId }).select("members").lean();
};

// Socket handlers must never crash the process
const safe = <A extends unknown[]>(handler: (...args: A) => Promise<unknown>) =>
    (...args: A) => {
        handler(...args).catch((error: Error) => console.error("Socket handler error:", error.message));
    };

export const registerHandlers = (socket: Socket) => {
    const user = socket.data.user as SocketUser;
    const userId = user._id;

    socket.join(userRoom(userId));
    safe(userConnected)(userId);

    socket.on(NEW_MESSAGE, safe(async ({ chatId, message }: { chatId?: string; message?: unknown } = {}, ack?: Ack) => {
        const reply: Ack = typeof ack === "function" ? ack : () => {};
        const content = typeof message === "string" ? message.trim() : "";
        if (!content) return reply({ ok: false, error: "Message is empty" });
        if (content.length > MESSAGE_MAX) {
            return reply({ ok: false, error: `Messages can be at most ${MESSAGE_MAX} characters` });
        }

        const chat = await loadChatForMember(chatId, userId);
        if (!chat) return reply({ ok: false, error: "Chat not found" });

        const saved = await createAndDeliverMessage({ chatId: chat._id, members: chat.members, sender: user, content });
        reply({ ok: true, messageId: String(saved._id) });
    }));

    const relayTyping = (event: string) => safe(async ({ chatId }: { chatId?: string } = {}) => {
        const chat = await loadChatForMember(chatId, userId);
        if (!chat) return;
        emitToUsers(chat.members.filter((m) => !sameId(m, userId)), event, { chatId: String(chat._id) });
    });
    socket.on(START_TYPING, relayTyping(START_TYPING));
    socket.on(STOP_TYPING, relayTyping(STOP_TYPING));

    // Kept for client compatibility: presence is driven by connections, so
    // joining a chat just refreshes this user's view of who is online.
    socket.on(CHAT_JOINED, safe(() => refreshPresence(userId)));
    socket.on(CHAT_LEAVED, () => {});

    socket.on("disconnect", safe(() => userDisconnected(userId)));
};
