import { getContactIds } from "../modules/chat/chat.service.js";
import { ONLINE_USERS } from "./events.js";
import { emitToUsers } from "./index.js";

// userId -> number of connected sockets (a user can have several tabs/devices)
const connectionCounts = new Map<string, number>();

export const isOnline = (userId: string): boolean => connectionCounts.has(userId);

// Each user only learns the online status of their own contacts
const sendPresenceTo = async (userId: string) => {
    const contacts = await getContactIds(userId);
    emitToUsers([userId], ONLINE_USERS, contacts.filter(isOnline));
};

const notifyContacts = async (userId: string) => {
    const contacts = await getContactIds(userId);
    await Promise.all(contacts.filter(isOnline).map(sendPresenceTo));
};

export const userConnected = async (userId: string) => {
    const wasOnline = isOnline(userId);
    connectionCounts.set(userId, (connectionCounts.get(userId) ?? 0) + 1);
    if (!wasOnline) await notifyContacts(userId);
    await sendPresenceTo(userId);
};

export const userDisconnected = async (userId: string) => {
    const remaining = (connectionCounts.get(userId) ?? 1) - 1;
    if (remaining > 0) {
        connectionCounts.set(userId, remaining);
        return;
    }
    connectionCounts.delete(userId);
    await notifyContacts(userId);
};

export const refreshPresence = sendPresenceTo;
