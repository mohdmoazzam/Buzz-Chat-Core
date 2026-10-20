import { BadRequestException, Injectable } from "@nestjs/common";
import { UPLOAD_MAX_FILES } from "../../common/constants";
import { areValidIds, toIdList } from "../../common/utils/ids";
import { PrismaService } from "../../core/prisma.service";
import { RealtimeService } from "../../core/realtime.service";
import { NEW_MESSAGE, NEW_MESSAGE_ALERT } from "../../socket/events";
import { ASSET_SELECT, AssetsService } from "../assets/assets.service";
import { ChatAccess, memberIdsOf } from "../chat/chat.access";
import { MESSAGES_PAGE_SIZE } from "./message.constants";

/** The sender as embedded in messages: id and name columns. */
export type MessageSender = { id: string; first_name: string; last_name: string };

const SENDER_SELECT = { id: true, first_name: true, last_name: true } as const;

/** Attachments in the order they were sent, as asset records. */
export const ATTACHMENTS_INCLUDE = { orderBy: { position: "asc" }, select: { asset: { select: ASSET_SELECT } } } as const;

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
    /** Asset ids, already checked with AssetsService.assertUsable */
    attachmentIds?: string[];
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
     * Used by both the socket (text) and HTTP (attachments) paths so they behave the same.
     * Returns the message with its sender and attachments, as sent to clients.
     */
    async createAndDeliver({ chatId, memberIds, sender, content = "", attachmentIds = [] }: CreateMessageInput) {
        // Persist first so the broadcast carries the real id and timestamp
        const [row] = await this.prisma.$transaction([
            this.prisma.messages.create({
                data: {
                    content,
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
                include: { sender: { select: SENDER_SELECT }, attachments: ATTACHMENTS_INCLUDE },
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
}
