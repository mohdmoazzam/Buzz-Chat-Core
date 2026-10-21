import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsIn, IsString, IsUUID, Length, Matches, MaxLength, ValidateIf } from "class-validator";
import type { gender } from "../../../prisma/generated/client";
import { BIO_MAX, GENDERS, NAME_MAX, PHONE_REGEX, USERNAME_REGEX } from "../../common/constants";
import { SkipIfMissing, Trim } from "../../common/validation";

/** Only the fields that are sent are changed. */
export class UpdateProfileDto {
    @ApiPropertyOptional({ minLength: 1, maxLength: NAME_MAX })
    @SkipIfMissing()
    @Trim()
    @Length(1, NAME_MAX)
    @IsString()
    first_name?: string;

    @ApiPropertyOptional({ maxLength: NAME_MAX })
    @SkipIfMissing()
    @Trim()
    @MaxLength(NAME_MAX)
    @IsString()
    last_name?: string;

    @ApiPropertyOptional({ minLength: 1, maxLength: BIO_MAX })
    @SkipIfMissing()
    @Trim()
    @Length(1, BIO_MAX)
    @IsString()
    bio?: string;

    @ApiPropertyOptional({ pattern: USERNAME_REGEX.source })
    @SkipIfMissing()
    @Trim()
    @Matches(USERNAME_REGEX)
    @IsString()
    username?: string;

    @ApiPropertyOptional({ enum: [...GENDERS, ""] })
    @SkipIfMissing()
    @Trim()
    @IsIn([...GENDERS, ""])
    @IsString()
    gender?: gender | "";

    @ApiPropertyOptional({ example: "+15551234567" })
    // Validated only when sent and not "" (which clears the number)
    @ValidateIf((_object, value) => value !== undefined && value !== "")
    // Stored normalized: "+1 (555) 123-4567" becomes "+15551234567"
    @Transform(({ value }) => (typeof value === "string" ? value.trim().replace(/[\s\-().]/g, "") : value))
    @Matches(PHONE_REGEX)
    @IsString()
    phone?: string;

    @ApiPropertyOptional({ format: "uuid" })
    @SkipIfMissing()
    @IsUUID("7")
    avatar_id?: string;
}
