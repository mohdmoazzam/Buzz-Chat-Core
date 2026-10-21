export interface PersonName {
    first_name: string;
    last_name: string;
}

/** A person's display name ("Ada Lovelace", or just "Ada"), used in alerts and chat names. */
export const fullName = ({ first_name, last_name }: PersonName): string => [first_name, last_name].filter(Boolean).join(" ");
