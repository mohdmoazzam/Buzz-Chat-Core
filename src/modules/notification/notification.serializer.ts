import type { Prisma } from "../../../prisma/generated/client";
import { PERSON_SELECT } from "../user/user.serializer";

export const NOTIFICATION_INCLUDE = { actor: { select: PERSON_SELECT } } as const;

type NotificationRow = Prisma.notificationsGetPayload<{ include: typeof NOTIFICATION_INCLUDE }>;

export const serializeNotification = ({ user_id: _userId, actor_id: _actorId, ...notification }: NotificationRow) => ({
    ...notification,
    read: notification.read_at !== null,
});
