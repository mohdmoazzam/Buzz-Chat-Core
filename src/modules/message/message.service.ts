import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
    FORWARD_MAX_CHATS, MESSAGE_EDIT_WINDOW_MS, MESSAGE_MAX, MESSAGES_PAGE_SIZE, UPLOAD_MAX_FILES,
} from "../../common/constants";
import { areValidIds, isValidId, toIdList } from "../../common/utils/ids";
import { PrismaService } from "../../core/prisma.service";
import { RealtimeService } from "../../core/realtime.service";
import { MESSAGE_DELETED, MESSAGE_UPDATED, NEW_MESSAGE, NEW_MESSAGE_ALERT } from "../../socket/events";
import { ASSET_SELECT, AssetsService } from "../assets/assets.service";
import { ChatAccess, memberIdsOf, type ChatWithMemberIds } from "../chat/chat.access";

/** The sender as embedded in messages: id and name columns. */
export type MessageSender = { id: string; first_name: string; last_name: string };

const SENDER_SELECT = { id: true, first_name: true, last_name: true } as const;

/** Attachments in the order they were sent, as asset records. */
export const ATTACHMENTS_INCLUDE = { orderBy: { position: "asc" }, select: { asset: { select: ASSET_SELECT } } } as const;

/** A message as sent to clients: with its sender and attachments. */
const MESSAGE_INCLUDE = { sender: { select: SENDER_SELECT }, attachments: ATTACHMENTS_INCLUDE } as const;

/** Flattens message_attachments rows into the list of attached assets. */
export const withAssets = <T extends { attachments: { asset: unknown }[] }>(message: T) => ({
    ...message,
    attachments: message.attachments.map((attachment) => attachment.asset),
});

interface CreateMessageInput {
    chatId: string;
    memberIds: string[];
    sender: MessageSender;
    content?: string;
    /** Asset ids, already checked with AssetsService.assertUsable (or taken from a message being forwarded) */
    attachmentIds?: string[];
    forwarded?: boolean;
}

@Injectable()
export class MessageService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly access: ChatAccess,
        private readonly assets: AssetsService,
        private readonly realtime: RealtimeService,
    ) {}

    /**
     * Persists a message, bumps the chat's activity, and delivers it in real time.
     * Used by both the socket (text) and HTTP (attachments, forwards) paths so they behave the same.
     * Returns the message with its sender and attachments, as sent to clients.
     */
    async createAndDeliver({ chatId, memberIds, sender, content = "", attachmentIds = [], forwarded = false }: CreateMessageInput) {
        // Persist first so the broadcast carries the real id and timestamp
        const [row] = await this.prisma.$transaction([
            this.prisma.messages.create({
                data: {
                    content,
                    forwarded,
                    sender_id: sender.id,
                    chat_id: chatId,
                    attachments: { create: attachmentIds.map((asset_id, position) => ({ asset_id, position })) },
                },
                include: { attachments: ATTACHMENTS_INCLUDE },
            }),
            this.access.touch(chatId),
        ]);
        const message = { ...withAssets(row), sender };

        this.realtime.emitToUsers(memberIds, NEW_MESSAGE, { chat_id: chatId, message });
        this.realtime.emitToUsers(memberIds.filter((id) => id !== sender.id), NEW_MESSAGE_ALERT, { chat_id: chatId });
        return message;
    }

    /** Paginated chat history, oldest first within a page. */
    async getMessages(me: string, chatId: unknown, rawPage: unknown) {
        const chat = await this.access.findForMember(chatId, me);
        const page = Math.max(1, Number.parseInt(String(rawPage), 10) || 1);

        const [messages, totalMessages] = await Promise.all([
            this.prisma.messages.findMany({
                where: { chat_id: chat.id },
                orderBy: [{ created_at: "desc" }, { id: "desc" }],
                skip: (page - 1) * MESSAGES_PAGE_SIZE,
                take: MESSAGES_PAGE_SIZE,
                include: MESSAGE_INCLUDE,
            }),
            this.prisma.messages.count({ where: { chat_id: chat.id } }),
        ]);

        return {
            messages: messages.reverse().map(withAssets),
            total_pages: Math.ceil(totalMessages / MESSAGES_PAGE_SIZE),
        };
    }

    /** Sends files that were uploaded first via POST /assets. */
    async sendAttachments(sender: MessageSender, chatId: unknown, rawAttachmentIds: unknown) {
        const attachmentIds = toIdList(rawAttachmentIds);
        if (!attachmentIds.length) {
            throw new BadRequestException("Please provide attachments");
        }
        if (attachmentIds.length > UPLOAD_MAX_FILES) {
            throw new BadRequestException(`You can send up to ${UPLOAD_MAX_FILES} files at a time`);
        }
        if (!areValidIds(attachmentIds)) {
            throw new BadRequestException("Invalid attachments");
        }

        const chat = await this.access.findForMember(chatId, sender.id);
        await this.assets.assertUsable(attachmentIds, sender.id);

        return this.createAndDeliver({ chatId: chat.id, memberIds: memberIdsOf(chat), sender, attachmentIds });
    }

    /** Replaces the text of the user's own message, within MESSAGE_EDIT_WINDOW_MS of sending it. */
    async editMessage(me: string, chatId: unknown, messageId: unknown, rawContent: unknown) {
        const chat = await this.access.findForMember(chatId, me);
        const message = await this.findOwnMessage(chat, messageId, me, "edit");

        if (!message.content) {
            throw new BadRequestException("Only text messages can be edited");
        }
        if (Date.now() - message.created_at.getTime() > MESSAGE_EDIT_WINDOW_MS) {
            throw new BadRequestException(`Messages can only be edited within ${MESSAGE_EDIT_WINDOW_MS / 60_000} minutes of sending`);
        }

        const content = typeof rawContent === "string" ? rawContent.trim() : "";
        if (!content) throw new BadRequestException("Message is empty");
        if (content.length > MESSAGE_MAX) {
            throw new BadRequestException(`Messages can be at most ${MESSAGE_MAX} characters`);
        }

        const row = await this.prisma.messages.update({
            where: { id: message.id },
            data: { content, edited_at: new Date() },
            include: MESSAGE_INCLUDE,
        });
        const updated = withAssets(row);

        this.realtime.emitToUsers(memberIdsOf(chat), MESSAGE_UPDATED, { chat_id: chat.id, message: updated });
        return updated;
    }

    /** Deletes the user's own message for everyone: the row stays as a "deleted" placeholder. */
    async deleteForEveryone(me: string, chatId: unknown, messageId: unknown) {
        const chat = await this.access.findForMember(chatId, me);
        const message = await this.findOwnMessage(chat, messageId, me, "delete");

        const links = await this.prisma.message_attachments.findMany({
            where: { message_id: message.id },
            select: { asset_id: true },
        });
        const [, row] = await this.prisma.$transaction([
            this.prisma.message_attachments.deleteMany({ where: { message_id: message.id } }),
            this.prisma.messages.update({
                where: { id: message.id },
                data: { content: "", deleted_at: new Date() },
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
    async forwardMessage(sender: MessageSender, chatId: unknown, messageId: unknown, rawChatIds: unknown) {
        const targetIds = toIdList(rawChatIds);
        if (!targetIds.length) {
            throw new BadRequestException("Please choose a chat to forward to");
        }
        if (targetIds.length > FORWARD_MAX_CHATS) {
            throw new BadRequestException(`You can forward to up to ${FORWARD_MAX_CHATS} chats at a time`);
        }
        if (!areValidIds(targetIds)) {
            throw new BadRequestException("Invalid chats");
        }

        const chat = await this.access.findForMember(chatId, sender.id);
        const message = await this.findMessage(chat, messageId);
        if (message.deleted_at) {
            throw new BadRequestException("This message was deleted");
        }

        const targets = await Promise.all(targetIds.map((id) => this.access.loadForMember(id, sender.id)));
        if (targets.some((target) => !target)) {
            throw new NotFoundException("Chat not found");
        }

        const links = await this.prisma.message_attachments.findMany({
            where: { message_id: message.id },
            orderBy: { position: "asc" },
            select: { asset_id: true },
        });
        const attachmentIds = links.map((link) => link.asset_id);

        // Shares the same asset records, so files aren't uploaded again
        for (const target of targets as ChatWithMemberIds[]) {
            await this.createAndDeliver({
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
        const message = isValidId(messageId)
            ? await this.prisma.messages.findFirst({ where: { id: messageId, chat_id: chat.id } })
            : null;
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
}
