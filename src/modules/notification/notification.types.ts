// Adding a notification:
//   1. an entry in NotificationData (what the caller passes) and NOTIFICATION_CHANNELS (where it goes)
//   2. a builder per channel in notification.templates.ts (push reuses the in-app text, plus a url)
//   email also needs a folder in templates/email/<name> (subject/html/text.ejs) + an entry in EmailTemplateData

export const EMAIL_QUEUE = "email";
export const IN_APP_QUEUE = "in-app";
export const PUSH_QUEUE = "push";

export type NotificationChannel = "email" | "in_app" | "push";

/** Every notification type and the data its caller provides. Recipient/actor details are loaded when queuing. */
export interface NotificationData {
    welcome: Record<string, never>;
    password_reset: { code: string; minutes: number };
    email_verification: { code: string; minutes: number };
    account_deletion: { code: string; minutes: number };
    friend_request_accepted: { chat_id: string };
    group_added: { chat_id: string; group_name: string };
}
export type NotificationType = keyof NotificationData;

/** The channels each notification type is delivered on. */
export const NOTIFICATION_CHANNELS = {
    welcome: ["email"],
    password_reset: ["email"],
    email_verification: ["email"],
    account_deletion: ["email"],
    friend_request_accepted: ["in_app", "push"],
    group_added: ["in_app", "push"],
} as const satisfies { [T in NotificationType]: readonly NotificationChannel[] };

type TypesOn<C extends NotificationChannel> = {
    [T in NotificationType]: C extends (typeof NOTIFICATION_CHANNELS)[T][number] ? T : never;
}[NotificationType];
export type EmailNotificationType = TypesOn<"email">;
export type InAppNotificationType = TypesOn<"in_app">;
export type PushNotificationType = TypesOn<"push">;

/** Everything a channel builder can use, collected once per recipient before queuing. */
export interface NotificationContext<T extends NotificationType = NotificationType> {
    recipient: {
        id: string;
        email: string;
        first_name: string;
        last_name: string;
        username: string;
    };
    actorName: string;
    data: NotificationData[T];
}

/** Every email template and the data it renders with. */
export interface EmailTemplateData {
    "password-reset": { firstName: string; code: string; minutes: number };
    "email-verification": { firstName: string; code: string; minutes: number };
    "account-deletion": { firstName: string; code: string; minutes: number };
    welcome: { firstName: string; username: string };
}
export type EmailTemplate = keyof EmailTemplateData;

export type EmailContent = { [K in EmailTemplate]: { template: K; data: EmailTemplateData[K] } }[EmailTemplate];

export type EmailJob = EmailContent & { to: string };

export interface InAppJob {
    /** Row id, chosen when enqueuing so a retried job never inserts twice. */
    id: string;
    user_id: string;
    actor_id: string | null;
    type: InAppNotificationType;
    title: string;
    body: string;
    /** Stored in notifications.data for the client (e.g. which chat to open). */
    data: NotificationData[InAppNotificationType];
}

/** What the service worker shows (public/sw.js in the frontend). */
export interface PushPayload {
    title: string;
    body: string;
    /** App path opened when the notification is clicked, e.g. /chat/<id> */
    url: string;
    /** A newer notification with the same tag replaces the older one (one per chat) */
    tag?: string;
}

export interface PushJob extends PushPayload {
    user_id: string;
    /** Endpoints already delivered to, so a retry only resends to the devices that failed. */
    sent?: string[];
}
