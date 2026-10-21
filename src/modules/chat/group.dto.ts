import { DISAPPEARING_OPTIONS } from "../../common/constants";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayNotEmpty, IsDefined, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Length, MaxLength, ValidateIf } from "class-validator";
import { GROUP_DESCRIPTION_MAX, GROUP_MAX_MEMBERS, GROUP_MIN_MEMBERS, GROUP_NAME_MAX } from "../../common/constants";
import { SkipIfMissing, ToIdList, Trim } from "../../common/validation";

export class CreateGroupDto {
    @ApiProperty({ maxLength: GROUP_NAME_MAX })
    @Trim()
    @MaxLength(GROUP_NAME_MAX)
    @IsNotEmpty()
    @IsString()
    name!: string;

    @ApiPropertyOptional({ maxLength: GROUP_DESCRIPTION_MAX })
    @IsOptional()
    @Trim()
    @MaxLength(GROUP_DESCRIPTION_MAX)
    @IsString()
    description?: string;

    @ApiProperty({ type: [String] })
    @ToIdList()
    @IsUUID("7", { each: true })
    @IsDefined()
    members!: string[];

    @ApiPropertyOptional({ format: "uuid" })
    @IsOptional()
    @IsUUID("7")
    avatar_id?: string;
}

/** Only the fields that are sent are changed. */
export class UpdateGroupDto {
    @ApiPropertyOptional({ minLength: 1, maxLength: GROUP_NAME_MAX })
    @SkipIfMissing()
    @Trim()
    @Length(1, GROUP_NAME_MAX)
    @IsString()
    name?: string;

    @ApiPropertyOptional({ maxLength: GROUP_DESCRIPTION_MAX })
    @SkipIfMissing()
    @Trim()
    @MaxLength(GROUP_DESCRIPTION_MAX)
    @IsString()
    description?: string;

    @ApiPropertyOptional({ format: "uuid" })
    @SkipIfMissing()
    @IsUUID("7")
    avatar_id?: string;
}

export class AddMembersDto {
    @ApiProperty({ type: [String] })
    @ToIdList()
    @IsUUID("7", { each: true })
    @ArrayNotEmpty()
    members!: string[];
}

export class DisappearingDto {
    // null turns it off
    @ApiProperty({ enum: [...DISAPPEARING_OPTIONS], nullable: true, description: "Seconds until new messages disappear; null = off" })
    @ValidateIf((_object, value) => value !== null)
    @IsIn([...DISAPPEARING_OPTIONS], { message: "Choose 24 hours, 7 days, 90 days or off" })
    seconds!: number | null;
}
