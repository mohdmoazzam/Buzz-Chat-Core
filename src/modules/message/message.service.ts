import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { MESSAGE_EDIT_WINDOW_MS, MESSAGES_PAGE_MAX, MESSAGES_PAGE_SIZE } from "../../common/constants";
import { isValidId } from "../../common/utils/ids";
import { CursorPagination } from "../../common/utils/pagination";
import { PrismaService } from "../../core/prisma.service";
import { RealtimeService } from "../../core/realtime.service";
import { MESSAGE_DELETED, MESSAGE_UPDATED, NEW_MESSAGE, NEW_MESSAGE_ALERT } from "../../socket/events";
import { AssetsService } from "../assets/assets.service";
import { ChatAccess, memberIdsOf, type ChatWithMemberIds } from "../chat/chat.access";
import { ReadStateService } from "../chat/read-state.service";
import { ATTACHMENTS_INCLUDE, MESSAGE_INCLUDE, withAssets, type MessageSender } from "./message.serializer";

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
        private readonly readState: ReadStateService,
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
        this.realtime.emitToUsers(
            memberIds.filter((id) => id !== sender.id),
            NEW_MESSAGE_ALERT,
            { chat_id: chatId },
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
                where: { chat_id: chat.id },
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
    async sendAttachments(sender: MessageSender, chatId: unknown, attachmentIds: string[]) {
        const chat = await this.access.findForMember(chatId, sender.id);
        await this.assets.assertUsable(attachmentIds, sender.id);

        return this.createAndDeliver({ chatId: chat.id, memberIds: memberIdsOf(chat), sender, attachmentIds });
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
        const row = await this.prisma.messages.update({
            where: { id: message.id },
            data: {
                content,
                edited_at: new Date(),
            },
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
    async forwardMessage(sender: MessageSender, chatId: unknown, messageId: unknown, targetIds: string[]) {
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
}
