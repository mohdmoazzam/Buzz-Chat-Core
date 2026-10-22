import { InjectQueue } from "@nestjs/bullmq";
import { errorMessage } from "../../common/errors";
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Queue } from "bullmq";
import { MESSAGE_EDIT_WINDOW_MS, MESSAGES_PAGE_MAX, MESSAGES_PAGE_SIZE } from "../../common/constants";
import { isValidId } from "../../common/utils/ids";
import { CursorPagination } from "../../common/utils/pagination";
import { Prisma } from "../../../prisma/generated/client";
import { PrismaService } from "../../core/prisma.service";
import { RealtimeService } from "../../core/realtime.service";
import { MESSAGE_DELETED, MESSAGE_HIDDEN, MESSAGE_UPDATED, NEW_MESSAGE, NEW_MESSAGE_ALERT } from "../../socket/events";
import { AssetsService } from "../assets/assets.service";
import { ChatAccess, memberIdsOf, type ChatWithMemberIds } from "../chat/chat.access";
import { ReadStateService } from "../chat/read-state.service";
import { PushService } from "../notification/push.service";
import { fullName } from "../user/user.names";
import { firstUrl, LINK_PREVIEW_QUEUE, type LinkPreviewJob } from "./link-preview/link-preview.fetcher";
import { ATTACHMENTS_INCLUDE, MESSAGE_INCLUDE, REPLY_TO_INCLUDE, withAssets, type MessageSender } from "./message.serializer";

interface CreateMessageInput {
    chatId: string;
    memberIds: string[];
    sender: MessageSender;
    content?: string;
    /** Asset ids, already checked with AssetsService.assertUsable (or taken from a message being forwarded) */
    attachmentIds?: string[];
    forwarded?: boolean;
    /** The message this one replies to (any id the client sent: checked here) */
    replyToId?: unknown;
    /** The chat's disappearing-messages timer (chats.disappearing_seconds); null = the message stays */
    disappearingSeconds?: number | null;
    /** The group's name (the push notification title), or null for a 1:1 chat */
    groupName: string | null;
}

/** Longest message text put in a push notification. */
const PUSH_BODY_MAX = 200;

/** "📷 Photo", "🎥 Video", ... for a message that is only files. */
const attachmentLabel = (attachments: { mime_type: string; duration_ms: number | null }[]): string => {
    // Only voice messages have a duration
    if (attachments[0]?.duration_ms != null) return "🎤 Voice message";
    const type = attachments[0]?.mime_type ?? "";
    if (type.startsWith("image/")) return attachments.length > 1 ? `📷 ${attachments.length} photos` : "📷 Photo";
    if (type.startsWith("video/")) return "🎥 Video";
    if (type.startsWith("audio/")) return "🎵 Audio";
    return "📎 File";
};

@Injectable()
export class MessageService {
    private readonly logger = new Logger(MessageService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly access: ChatAccess,
        private readonly assets: AssetsService,
        private readonly realtime: RealtimeService,
        private readonly readState: ReadStateService,
        private readonly push: PushService,
        @InjectQueue(LINK_PREVIEW_QUEUE) private readonly linkPreviews: Queue<LinkPreviewJob>,
    ) {}

    /**
     * Persists a message, bumps the chat's activity, and delivers it in real time.
     * Used by both the socket (text) and HTTP (attachments, forwards) paths so they behave the same.
     * Returns the message with its sender and attachments, as sent to clients.
     */
    async createAndDeliver({
        chatId,
        memberIds,
        sender,
        content = "",
        attachmentIds = [],
        forwarded = false,
        replyToId,
        disappearingSeconds,
        groupName,
    }: CreateMessageInput) {
        const replyTo = await this.findReplyTarget(chatId, replyToId);
        // Persist first so the broadcast carries the real id and timestamp
        const [row] = await this.prisma.$transaction([
            this.prisma.messages.create({
                data: {
                    content,
                    forwarded,
                    sender_id: sender.id,
                    chat_id: chatId,
                    reply_to_id: replyTo,
                    expires_at: disappearingSeconds ? new Date(Date.now() + disappearingSeconds * 1000) : null,
                    attachments: { create: attachmentIds.map((asset_id, position) => ({ asset_id, position })) },
                },
                include: { attachments: ATTACHMENTS_INCLUDE, reply_to: REPLY_TO_INCLUDE },
            }),
            this.access.touch(chatId),
        ]);
        const message = { ...withAssets(row), sender, reactions: [] };
        this.queueLinkPreview(row.id, content);

        this.realtime.emitToUsers(memberIds, NEW_MESSAGE, { chat_id: chatId, message });
        this.realtime.emitToUsers(
            memberIds.filter((id) => id !== sender.id),
            NEW_MESSAGE_ALERT,
            { chat_id: chatId },
        );
        this.queuePush(
            chatId,
            memberIds,
            sender,
            groupName,
            content || attachmentLabel(row.attachments.map((attachment) => attachment.asset)),
        );
        // Replying means you've read the chat; the message is already delivered, so this can't fail it
        await this.readState.markSent(chatId, sender.id, row.created_at, memberIds).catch(() => undefined);
        return message;
    }

    /**
     * Chat history newest first, a page at a time: ?cursor= is the oldest message loaded so far.
     * Within a page messages are oldest first, ready to prepend.
     */
    async getMessages(me: string, chatId: unknown, query: Record<string, unknown>) {
        const chat = await this.access.findForMember(chatId, me);
        const page = CursorPagination.parse(query, { defaultTake: MESSAGES_PAGE_SIZE, maxTake: MESSAGES_PAGE_MAX });

        const [rows, receipts] = await Promise.all([
            this.prisma.messages.findMany({
                // Not the ones this user deleted for themselves
                where: { chat_id: chat.id, hidden_for: { none: { user_id: me } } },
                orderBy: [{ created_at: "desc" }, { id: "desc" }],
                ...page.args((id) => ({ id })),
                include: MESSAGE_INCLUDE,
            }),
            this.readState.receipts(chat.id, me),
        ]);
        const { rows: messages, pagination } = page.result(rows, (message) => message.id);

        return {
            messages: messages.reverse().map(withAssets),
            pagination,
            // How far the other members have read: the ticks on your own messages
            read_receipts: receipts,
        };
    }

    /** Sends files that were uploaded first via POST /assets. */
    async sendAttachments(sender: MessageSender, chatId: unknown, attachmentIds: string[], replyToId?: string) {
        const chat = await this.access.findForMember(chatId, sender.id);
        await this.assets.assertUsable(attachmentIds, sender.id);

        return this.createAndDeliver({
            chatId: chat.id,
            memberIds: memberIdsOf(chat),
            sender,
            attachmentIds,
            replyToId,
            disappearingSeconds: chat.disappearing_seconds,
            groupName: chat.group_chat ? chat.name : null,
        });
    }

    /** Replaces the text of the user's own message, within MESSAGE_EDIT_WINDOW_MS of sending it. */
    async editMessage(me: string, chatId: unknown, messageId: unknown, content: string) {
        const chat = await this.access.findForMember(chatId, me);
        const message = await this.findOwnMessage(chat, messageId, me, "edit");

        if (!message.content) {
            throw new BadRequestException("Only text messages can be edited");
        }
        if (Date.now() - message.created_at.getTime() > MESSAGE_EDIT_WINDOW_MS) {
            throw new BadRequestException(`Messages can only be edited within ${MESSAGE_EDIT_WINDOW_MS / 60_000} minutes of sending`);
        }
        // A different link means a different card: clear the old one and fetch the new one
        const linkChanged = firstUrl(content) !== firstUrl(message.content);
        const row = await this.prisma.messages.update({
            where: { id: message.id },
            data: {
                content,
                edited_at: new Date(),
                ...(linkChanged ? { link_preview: Prisma.DbNull } : {}),
            },
            include: MESSAGE_INCLUDE,
        });
        const updated = withAssets(row);
        if (linkChanged) this.queueLinkPreview(row.id, content);

        this.realtime.emitToUsers(memberIdsOf(chat), MESSAGE_UPDATED, { chat_id: chat.id, message: updated });
        return updated;
    }

    /**
     * Sets (or with null, removes) the user's reaction to a message in a chat they're in. One per person:
     * a new emoji replaces theirs. Everyone in the chat gets the updated message (MESSAGE_UPDATED).
     */
    async react(me: string, chatId: unknown, messageId: unknown, emoji: string | null) {
        const chat = await this.access.findForMember(chatId, me);
        const message = await this.findMessage(chat, messageId);
        if (message.deleted_at) throw new BadRequestException("You can't react to a deleted message");

        const key = { message_id_user_id: { message_id: message.id, user_id: me } };
        if (emoji) {
            await this.prisma.message_reactions.upsert({
                where: key,
                create: { message_id: message.id, user_id: me, emoji },
                update: { emoji, created_at: new Date() },
            });
        } else {
            await this.prisma.message_reactions.deleteMany({ where: { message_id: message.id, user_id: me } });
        }

        const updated = withAssets(await this.prisma.messages.findUniqueOrThrow({ where: { id: message.id }, include: MESSAGE_INCLUDE }));
        this.realtime.emitToUsers(memberIdsOf(chat), MESSAGE_UPDATED, { chat_id: chat.id, message: updated });
        return updated;
    }

    /**
     * Delete for me: hides any message in the chat (theirs, someone else's, or a deleted placeholder) for
     * this user only. Their other devices drop it too (MESSAGE_HIDDEN to their own sockets).
     */
    async hideForMe(me: string, chatId: unknown, messageId: unknown): Promise<void> {
        const chat = await this.access.findForMember(chatId, me);
        const message = await this.findMessage(chat, messageId);

        await this.prisma.message_hidden.createMany({ data: [{ message_id: message.id, user_id: me }], skipDuplicates: true });
        this.realtime.emitToUsers([me], MESSAGE_HIDDEN, { chat_id: chat.id, message_id: message.id });
    }

    /** Deletes the user's own message for everyone: the row stays as a "deleted" placeholder. */
    async deleteForEveryone(me: string, chatId: unknown, messageId: unknown) {
        const chat = await this.access.findForMember(chatId, me);
        const message = await this.findOwnMessage(chat, messageId, me, "delete");

        const links = await this.prisma.message_attachments.findMany({
            where: { message_id: message.id },
            select: { asset_id: true },
        });
        const [, , row] = await this.prisma.$transaction([
            this.prisma.message_attachments.deleteMany({ where: { message_id: message.id } }),
            this.prisma.message_reactions.deleteMany({ where: { message_id: message.id } }),
            this.prisma.messages.update({
                where: { id: message.id },
                data: { content: "", deleted_at: new Date(), reply_to_id: null, link_preview: Prisma.DbNull },
                include: MESSAGE_INCLUDE,
            }),
        ]);
        // Files no other message uses are removed too
        this.assets.removeInBackground(links.map((link) => link.asset_id));
        const deleted = withAssets(row);

        this.realtime.emitToUsers(memberIdsOf(chat), MESSAGE_DELETED, { chat_id: chat.id, message: deleted });
        return deleted;
    }

    /** Sends a copy of a message (text and files) to other chats the user belongs to. */
    async forwardMessage(sender: MessageSender, chatId: unknown, messageId: unknown, targetIds: string[]) {
        const chat = await this.access.findForMember(chatId, sender.id);
        const message = await this.findMessage(chat, messageId);
        if (message.deleted_at) {
            throw new BadRequestException("This message was deleted");
        }

        const targets = await Promise.all(targetIds.map((id) => this.access.findForMember(id, sender.id)));

        const links = await this.prisma.message_attachments.findMany({
            where: { message_id: message.id },
            orderBy: { position: "asc" },
            select: { asset_id: true },
        });
        const attachmentIds = links.map((link) => link.asset_id);

        // Shares the same asset records, so files aren't uploaded again
        for (const target of targets) {
            await this.createAndDeliver({
                disappearingSeconds: target.disappearing_seconds,
                groupName: target.group_chat ? target.name : null,
                chatId: target.id,
                memberIds: memberIdsOf(target),
                sender,
                content: message.content,
                attachmentIds,
                forwarded: true,
            });
        }
        return targets.length;
    }

    /** A message in this chat (404 if it isn't there). */
    private async findMessage(chat: ChatWithMemberIds, messageId: unknown) {
        const message = isValidId(messageId) ? await this.prisma.messages.findFirst({ where: { id: messageId, chat_id: chat.id } }) : null;
        if (!message) throw new NotFoundException("Message not found");
        return message;
    }

    /** A message in this chat that the user sent and that hasn't been deleted. */
    private async findOwnMessage(chat: ChatWithMemberIds, messageId: unknown, me: string, action: string) {
        const message = await this.findMessage(chat, messageId);
        if (message.sender_id !== me) {
            throw new ForbiddenException(`You can only ${action} your own messages`);
        }
        if (message.deleted_at) {
            throw new BadRequestException("This message was deleted");
        }
        return message;
    }

    /**
     * The id to store as reply_to_id: the quoted message must be in the same chat and not deleted.
     * Undefined when the message isn't a reply.
     */
    private async findReplyTarget(chatId: string, replyToId: unknown): Promise<string | undefined> {
        if (replyToId === undefined || replyToId === null || replyToId === "") return undefined;
        const target = isValidId(replyToId)
            ? await this.prisma.messages.findFirst({ where: { id: replyToId, chat_id: chatId }, select: { id: true, deleted_at: true } })
            : null;
        if (!target || target.deleted_at) {
            throw new BadRequestException("The message you're replying to isn't available any more");
        }
        return target.id;
    }

    /** Queues a link preview when the text has a link; best effort, never fails the message. */
    private queueLinkPreview(messageId: string, content: string): void {
        if (!firstUrl(content)) return;
        this.linkPreviews
            .add("preview", { message_id: messageId })
            .catch((error) => this.logger.warn(`Couldn't queue a link preview: ${errorMessage(error)}`));
    }

    /** Pushes the message to members' devices that don't have the app open; best effort, never fails the message. */
    private queuePush(chatId: string, memberIds: string[], sender: MessageSender, groupName: string | null, text: string): void {
        const preview = text.length > PUSH_BODY_MAX ? `${text.slice(0, PUSH_BODY_MAX - 1)}…` : text;
        const payload = {
            title: groupName ?? fullName(sender),
            body: groupName ? `${sender.first_name}: ${preview}` : preview,
            url: `/chat/${chatId}`,
            tag: `chat:${chatId}`,
        };
        this.push
            .enqueue(memberIds.filter((id) => id !== sender.id).map((user_id) => ({ user_id, ...payload })))
            .catch((error) => this.logger.warn(`Couldn't queue message pushes: ${errorMessage(error)}`));
    }
}
