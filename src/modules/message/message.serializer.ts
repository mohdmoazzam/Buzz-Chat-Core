import { ASSET_SELECT } from "../assets/assets.service";
import { NAME_SELECT, type UserName } from "../user/user.serializer";

/** The sender as embedded in messages: id and name columns. */
export type MessageSender = UserName;

/** Attachments in the order they were sent, as asset records. */
export const ATTACHMENTS_INCLUDE = { orderBy: { position: "asc" }, select: { asset: { select: ASSET_SELECT } } } as const;

/** Longest snippet of the original shown in a reply's quote. */
const REPLY_SNIPPET_MAX = 200;

/** The message a reply quotes: enough for the preview (who, a snippet, its first file's type). */
export const REPLY_TO_INCLUDE = {
    select: {
        id: true,
        content: true,
        deleted_at: true,
        sender: { select: NAME_SELECT },
        attachments: {
            orderBy: { position: "asc" },
            take: 1,
            select: { asset: { select: { url: true, mime_type: true, resource_type: true } } },
        },
    },
} as const;

/** Who reacted with what, oldest first (clients group them into "👍 2" chips). */
export const REACTIONS_INCLUDE = { orderBy: { created_at: "asc" }, select: { emoji: true, user: { select: NAME_SELECT } } } as const;

/** A message as sent to clients: with its sender, attachments, the message it replies to and its reactions. */
export const MESSAGE_INCLUDE = {
    sender: { select: NAME_SELECT },
    attachments: ATTACHMENTS_INCLUDE,
    reply_to: REPLY_TO_INCLUDE,
    reactions: REACTIONS_INCLUDE,
} as const;

interface ReplyToRow {
    id: string;
    content: string;
    deleted_at: Date | null;
    sender: UserName;
    attachments: { asset: { url: string; mime_type: string; resource_type: string } }[];
}

/** The quoted message for clients. A deleted original shows only that it was deleted, never its old text. */
const replyPreview = (row: ReplyToRow | null | undefined) =>
    row
        ? {
              id: row.id,
              sender: row.sender,
              deleted: !!row.deleted_at,
              content: row.deleted_at ? "" : row.content.slice(0, REPLY_SNIPPET_MAX),
              attachment: row.deleted_at ? null : (row.attachments[0]?.asset ?? null),
          }
        : null;

/** Flattens message_attachments rows into the list of attached assets, and shapes the reply preview. */
export const withAssets = <T extends { attachments: { asset: unknown }[]; reply_to?: ReplyToRow | null }>(message: T) => ({
    ...message,
    attachments: message.attachments.map((attachment) => attachment.asset),
    reply_to: replyPreview(message.reply_to),
});
