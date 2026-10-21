// Queues and the jobs they carry. Adding a notification:
//   email  - a folder in templates/email/<name> (subject/html/text.ejs) + an entry in EmailTemplateData
//   in-app - an entry in InAppTemplateData + its renderer in in-app.templates.ts

export const EMAIL_QUEUE = "email";
export const IN_APP_QUEUE = "in-app";

/** Every email template and the data it renders with (checked when enqueuing). */
export interface EmailTemplateData {
    "password-reset": { firstName: string; code: string; minutes: number };
    welcome: { firstName: string; username: string };
}
export type EmailTemplate = keyof EmailTemplateData;

export interface EmailJob<T extends EmailTemplate = EmailTemplate> {
    to: string;
    template: T;
    data: EmailTemplateData[T];
}

/** Every in-app notification type and its extra data (stored in notifications.data). */
export interface InAppTemplateData {
    friend_request_accepted: { chat_id: string };
    group_added: { chat_id: string; group_name: string };
}
export type InAppType = keyof InAppTemplateData;

export interface InAppJob<T extends InAppType = InAppType> {
    /** Row id, chosen when enqueuing so a retried job never inserts twice. */
    id: string;
    user_id: string;
    /** Who caused it; their name is filled into the text when the job runs. */
    actor_id: string | null;
    type: T;
    data: InAppTemplateData[T];
}
