import { ErrorHandler } from "../../common/errors.js";
import { isValidObjectId, sameId, type Id } from "../../common/utils/ids.js";
import type { UserSummary } from "../user/user.model.js";
import { Chat, type IChat } from "./chat.model.js";

export const isMember = (chat: Pick<IChat, "members">, userId: Id): boolean =>
    chat.members.some((m) => sameId(m, userId));

/** Loads a chat and asserts the user belongs to it (404 either way, so ids can't be probed). */
export const findChatForMember = async (chatId: unknown, userId: string) => {
    if (!isValidObjectId(chatId)) throw new ErrorHandler("Chat not found", 404);
    const chat = await Chat.findById(chatId);
    if (!chat || !isMember(chat, userId)) throw new ErrorHandler("Chat not found", 404);
    return chat;
};

export const assertGroupCreator = (chat: IChat, userId: string, action: string): void => {
    if (!chat.groupChat) throw new ErrorHandler("This is not a group chat", 400);
    if (!sameId(chat.creator, userId)) throw new ErrorHandler(`Only the group admin can ${action}`, 403);
};

/** Ids of everyone the user has a 1:1 chat with. */
export const getFriendIds = async (userId: string): Promise<Set<string>> => {
    const chats = await Chat.find({ groupChat: false, members: userId }).select("members").lean();
    return new Set(chats.flatMap(({ members }) => members.map(String)).filter((id) => id !== userId));
};

/** Ids of everyone who shares any chat with the user (used for presence). */
export const getContactIds = async (userId: string): Promise<string[]> => {
    const chats = await Chat.find({ members: userId }).select("members").lean();
    const ids = new Set(chats.flatMap(({ members }) => members.map(String)));
    ids.delete(userId);
    return [...ids];
};

/** Group picture if set, otherwise the first few member photos. */
export const groupAvatar = (chat: Pick<IChat, "avatar">, members: UserSummary[]): string[] =>
    chat.avatar?.url
        ? [chat.avatar.url]
        : members.slice(0, 3).map(({ avatar }) => avatar?.url).filter((url): url is string => Boolean(url));

/** Bumps updatedAt so chat lists sort by latest activity. */
export const touchChat = (chatId: Id) =>
    Chat.updateOne({ _id: chatId }, { $currentDate: { updatedAt: true } }).catch(() => {});

export const presentMembers = (members: (UserSummary | null)[]): UserSummary[] =>
    members.filter((m): m is UserSummary => Boolean(m));
