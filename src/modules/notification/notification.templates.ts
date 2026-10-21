import type {
    EmailContent,
    EmailNotificationType,
    InAppNotificationType,
    NotificationContext,
    NotificationType,
} from "./notification.types";

export interface InAppText {
    title: string;
    body: string;
}

type Builders<Types extends NotificationType, Out> = { [T in Types]: (ctx: NotificationContext<T>) => Out };

/** Template and data for each notification type delivered by email. */
export const EMAIL_BUILDERS: Builders<EmailNotificationType, EmailContent> = {
    welcome: ({ recipient }) => ({
        template: "welcome",
        data: {
            firstName: recipient.first_name,
            username: recipient.username,
        },
    }),
    password_reset: ({ recipient, data }) => ({
        template: "password-reset",
        data: {
            firstName: recipient.first_name,
            code: data.code,
            minutes: data.minutes,
        },
    }),
    email_verification: ({ recipient, data }) => ({
        template: "email-verification",
        data: {
            firstName: recipient.first_name,
            code: data.code,
            minutes: data.minutes,
        },
    }),
};

/** Title and body for each notification type delivered in-app. */
export const IN_APP_BUILDERS: Builders<InAppNotificationType, InAppText> = {
    friend_request_accepted: ({ actorName }) => ({
        title: "Friend request accepted",
        body: `${actorName} accepted your friend request. Say hi!`,
    }),
    group_added: ({ data, actorName }) => ({
        title: `Added to ${data.group_name}`,
        body: `${actorName} added you to the group`,
    }),
};

export const buildEmail = <T extends EmailNotificationType>(type: T, ctx: NotificationContext<T>): EmailContent =>
    (EMAIL_BUILDERS[type] as (ctx: NotificationContext<T>) => EmailContent)(ctx);

export const buildInApp = <T extends InAppNotificationType>(type: T, ctx: NotificationContext<T>): InAppText =>
    (IN_APP_BUILDERS[type] as (ctx: NotificationContext<T>) => InAppText)(ctx);
