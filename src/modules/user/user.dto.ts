import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsIn, IsString, Length, Matches, MaxLength, ValidateIf } from "class-validator";
import type { gender } from "../../../prisma/generated/client";
import { BIO_MAX, GENDERS, NAME_MAX, PHONE_REGEX, USERNAME_REGEX, USERNAME_RULE_MESSAGE } from "../../common/constants";
import { IsId, SkipIfMissing, Trim } from "../../common/validation";

const PHONE_MESSAGE = "Enter a valid phone number (7–15 digits)";

/** Only the fields that are sent are changed. */
export class UpdateProfileDto {
    @ApiPropertyOptional({ minLength: 1, maxLength: NAME_MAX })
    @SkipIfMissing()
    @Trim()
    @Length(1, NAME_MAX, { message: `First name must be 1–${NAME_MAX} characters` })
    @IsString({ message: `First name must be 1–${NAME_MAX} characters` })
    first_name?: string;

    @ApiPropertyOptional({ maxLength: NAME_MAX })
    @SkipIfMissing()
    @Trim()
    @MaxLength(NAME_MAX, { message: `Last name can be at most ${NAME_MAX} characters` })
    @IsString({ message: `Last name can be at most ${NAME_MAX} characters` })
    last_name?: string;

    @ApiPropertyOptional({ minLength: 1, maxLength: BIO_MAX })
    @SkipIfMissing()
    @Trim()
    @Length(1, BIO_MAX, { message: `Bio must be 1–${BIO_MAX} characters` })
    @IsString({ message: `Bio must be 1–${BIO_MAX} characters` })
    bio?: string;

    @ApiPropertyOptional({ pattern: USERNAME_REGEX.source })
    @SkipIfMissing()
    @Trim()
    @Matches(USERNAME_REGEX, { message: USERNAME_RULE_MESSAGE })
    @IsString({ message: USERNAME_RULE_MESSAGE })
    username?: string;

    @ApiPropertyOptional({ enum: [...GENDERS, ""], description: '"" clears it' })
    @SkipIfMissing()
    @Trim()
    @IsIn([...GENDERS, ""], { message: "Invalid gender" })
    @IsString({ message: "Invalid gender" })
    gender?: gender | "";

    @ApiPropertyOptional({ example: "+15551234567", description: 'Spaces, dashes, dots and brackets are ignored; "" clears it' })
    // Validated only when sent and not "" (which clears the number)
    @ValidateIf((_object, value) => value !== undefined && value !== "")
    // Stored normalized: "+1 (555) 123-4567" becomes "+15551234567"
    @Transform(({ value }) => (typeof value === "string" ? value.trim().replace(/[\s\-().]/g, "") : value))
    @Matches(PHONE_REGEX, { message: PHONE_MESSAGE })
    @IsString({ message: PHONE_MESSAGE })
    phone?: string;

    @ApiPropertyOptional({ format: "uuid", description: "New profile photo, uploaded first via POST /assets" })
    @SkipIfMissing()
    @IsId({ message: "Invalid profile photo" })
    avatar_id?: string;
}
