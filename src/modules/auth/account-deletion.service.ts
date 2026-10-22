import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { MailService } from "../../core/mail.service";
import { PrismaService } from "../../core/prisma.service";
import { RealtimeService } from "../../core/realtime.service";
import { SessionService } from "../../core/session.service";
import { REFETCH_CHATS } from "../../socket/events";
import { AssetsService } from "../assets/assets.service";
import { MEMBER_ORDER } from "../chat/chat.access";
import { OtpService } from "./otp.service";

// A group the user leaves behind keeps going with at least this many members; smaller ones are deleted
const GROUP_KEEP_MIN = 2;

/**
 * Delete my account, confirmed with a code emailed to the account's address.
 *
 * Deleting a users row cascades to its memberships, messages, requests, sessions and notifications,
 * but chats.creator_id cascades too, which would wipe every group the user admins for everyone.
 * So groups are handed over first (or deleted when almost nobody would be left), 1:1 chats are
 * deleted whole, and the files nobody else uses are removed from storage afterwards.
 */
@Injectable()
export class AccountDeletionService {
    private readonly logger = new Logger(AccountDeletionService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly mail: MailService,
        private readonly sessions: SessionService,
        private readonly assets: AssetsService,
        private readonly realtime: RealtimeService,
        private readonly otp: OtpService,
    ) {}

    /** Emails a new confirmation code, replacing any earlier one. 429 within a minute of the last code. */
    async sendCode(userId: string): Promise<void> {
        if (!this.mail.isConfigured) {
            throw new HttpException("Account deletion isn't available right now (email is not set up)", HttpStatus.SERVICE_UNAVAILABLE);
        }
        await this.otp.send("account_deletion", userId);
    }

    /** Checks the code, then deletes the account and everything that belongs only to it (the code included). */
    async deleteAccount(userId: string, code: string): Promise<void> {
        await this.otp.check("account_deletion", userId, code);

        const [user, memberships, ownAttachments, ownUploads] = await Promise.all([
            this.prisma.users.findUniqueOrThrow({ where: { id: userId }, select: { avatar_id: true, cover_id: true } }),
            this.prisma.chat_members.findMany({
                where: { user_id: userId },
                select: {
                    chat: {
                        select: {
                            id: true,
                            group_chat: true,
                            creator_id: true,
                            avatar_id: true,
                            members: { orderBy: MEMBER_ORDER, select: { user_id: true } },
                        },
                    },
                },
            }),
            // Files in the user's own messages, wherever they were sent
            this.prisma.message_attachments.findMany({ where: { message: { sender_id: userId } }, select: { asset_id: true } }),
            // Anything they uploaded but never sent
            this.prisma.assets.findMany({ where: { uploaded_by: userId }, select: { id: true } }),
        ]);

        const chats = memberships.map(({ chat }) => ({
            ...chat,
            others: chat.members.map((m) => m.user_id).filter((id) => id !== userId),
        }));
        // 1:1 chats go entirely; so do groups that would be left almost empty
        const deleted = chats.filter((chat) => !chat.group_chat || chat.others.length < GROUP_KEEP_MIN);
        // Groups this user admins pass to the longest-standing remaining member (same as leaving)
        const handedOver = chats.filter((chat) => chat.group_chat && chat.creator_id === userId && chat.others.length >= GROUP_KEEP_MIN);
        const deletedIds = deleted.map((chat) => chat.id);
        const deletedChatFiles = deletedIds.length
            ? await this.prisma.message_attachments.findMany({
                  where: { message: { chat_id: { in: deletedIds } } },
                  select: { asset_id: true },
              })
            : [];
        const contacts = [...new Set(chats.flatMap((chat) => chat.others))];

        // Log every device out first, so no request or socket keeps working mid-deletion
        await this.sessions.revokeAll(userId);
        await this.prisma.$transaction([
            ...handedOver.map((chat) =>
                this.prisma.chats.update({ where: { id: chat.id }, data: { creator_id: chat.others[0] }, select: { id: true } }),
            ),
            this.prisma.chats.deleteMany({ where: { id: { in: deletedIds } } }),
            this.prisma.users.delete({ where: { id: userId }, select: { id: true } }),
        ]);

        // Only files nothing else uses any more are deleted (a forwarded copy keeps its file)
        this.assets.removeInBackground([
            user.avatar_id,
            user.cover_id,
            ...deleted.filter((chat) => chat.group_chat).map((chat) => chat.avatar_id),
            ...ownAttachments.map((row) => row.asset_id),
            ...deletedChatFiles.map((row) => row.asset_id),
            ...ownUploads.map((row) => row.id),
        ]);
        this.realtime.emitToUsers(contacts, REFETCH_CHATS);
        this.logger.log(`Account ${userId} deleted (${deletedIds.length} chats deleted, ${handedOver.length} groups handed over)`);
    }
}
