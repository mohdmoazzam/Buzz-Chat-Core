import { ASSET_SELECT } from "../assets/assets.service";
import { NAME_SELECT, type UserName } from "../user/user.serializer";

/** The sender as embedded in messages: id and name columns. */
export type MessageSender = UserName;

/** Attachments in the order they were sent, as asset records. */
export const ATTACHMENTS_INCLUDE = { orderBy: { position: "asc" }, select: { asset: { select: ASSET_SELECT } } } as const;

/** A message as sent to clients: with its sender and attachments. */
export const MESSAGE_INCLUDE = { sender: { select: NAME_SELECT }, attachments: ATTACHMENTS_INCLUDE } as const;

/** Flattens message_attachments rows into the list of attached assets. */
export const withAssets = <T extends { attachments: { asset: unknown }[] }>(message: T) => ({
    ...message,
    attachments: message.attachments.map((attachment) => attachment.asset),
});
