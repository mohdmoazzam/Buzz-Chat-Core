import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, Matches, MaxLength } from "class-validator";

// The push services of the browsers BuzzChat supports (Chrome, Edge, Firefox, Safari; other
// Chromium browsers use Google's). The server POSTs to the endpoint, so only these hosts are accepted.
const PUSH_HOST_SUFFIXES = ["fcm.googleapis.com", "push.services.mozilla.com", "notify.windows.com", "push.apple.com"];

export const isPushServiceUrl = (value: string): boolean => {
    try {
        const url = new URL(value);
        return url.protocol === "https:" && PUSH_HOST_SUFFIXES.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
    } catch {
        return false;
    }
};

const BASE64URL = /^[A-Za-z0-9_-]+=*$/;

/** The browser's PushSubscription: subscription.toJSON() gives { endpoint, keys: { p256dh, auth } }. */
export class PushSubscriptionDto {
    @ApiProperty({ description: "The browser push service URL for this device" })
    @Matches(/^https:\/\//, { message: "Invalid push subscription" })
    @MaxLength(2048)
    @IsNotEmpty()
    @IsString()
    endpoint!: string;

    @ApiProperty()
    @Matches(BASE64URL, { message: "Invalid push subscription" })
    @MaxLength(256)
    @IsNotEmpty()
    @IsString()
    p256dh!: string;

    @ApiProperty()
    @Matches(BASE64URL, { message: "Invalid push subscription" })
    @MaxLength(256)
    @IsNotEmpty()
    @IsString()
    auth!: string;
}
