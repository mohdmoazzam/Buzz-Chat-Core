import { BadRequestException } from "@nestjs/common";
import { NAME_MAX } from "../../common/constants";

export interface PersonName {
    first_name: string;
    last_name: string;
}

/** A person's display name ("Ada Lovelace", or just "Ada"), used in alerts and chat names. */
export const fullName = ({ first_name, last_name }: PersonName): string => [first_name, last_name].filter(Boolean).join(" ");

const asTrimmed = (value: unknown): string | undefined => (typeof value === "string" ? value.trim() : undefined);

/** first_name / last_name from a request, validated. Returns only the fields that were sent. */
export const readNameFields = (body: { first_name?: unknown; last_name?: unknown }): Partial<PersonName> => {
    const first_name = asTrimmed(body.first_name);
    const last_name = asTrimmed(body.last_name);

    if (first_name !== undefined && (!first_name || first_name.length > NAME_MAX)) {
        throw new BadRequestException(`First name must be 1–${NAME_MAX} characters`);
    }
    if (last_name !== undefined && last_name.length > NAME_MAX) {
        throw new BadRequestException(`Last name can be at most ${NAME_MAX} characters`);
    }
    return { ...(first_name !== undefined ? { first_name } : {}), ...(last_name !== undefined ? { last_name } : {}) };
};
