import type { InAppTemplateData, InAppType } from "./notification.types";

export interface InAppText {
    title: string;
    body: string;
}

type Renderers = { [T in InAppType]: (data: InAppTemplateData[T], actorName: string) => InAppText };

/** Title and body for each in-app notification type. */
export const IN_APP_TEMPLATES: Renderers = {
    friend_request_accepted: (_data, actorName) => ({
        title: "Friend request accepted",
        body: `${actorName} accepted your friend request. Say hi!`,
    }),
    group_added: (data, actorName) => ({
        title: `Added to ${data.group_name}`,
        body: `${actorName} added you to the group`,
    }),
};

export const renderInApp = <T extends InAppType>(type: T, data: InAppTemplateData[T], actorName: string): InAppText =>
    (IN_APP_TEMPLATES[type] as (data: InAppTemplateData[T], actorName: string) => InAppText)(data, actorName);
