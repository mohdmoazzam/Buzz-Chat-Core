import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayNotEmpty, IsDefined, IsNotEmpty, IsOptional, IsString, IsUUID, Length, MaxLength } from "class-validator";
import { GROUP_DESCRIPTION_MAX, GROUP_MAX_MEMBERS, GROUP_MIN_MEMBERS, GROUP_NAME_MAX } from "../../common/constants";
import { IsId, IsIdList, SkipIfMissing, ToIdList, Trim } from "../../common/validation";

export class CreateGroupDto {
    @ApiProperty({ maxLength: GROUP_NAME_MAX })
    @Trim()
    @MaxLength(GROUP_NAME_MAX, { message: `Group name can be at most ${GROUP_NAME_MAX} characters` })
    @IsNotEmpty({ message: "Please enter a group name" })
    @IsString({ message: "Please enter a group name" })
    name!: string;

    @ApiPropertyOptional({ maxLength: GROUP_DESCRIPTION_MAX })
    @IsOptional()
    @Trim()
    @MaxLength(GROUP_DESCRIPTION_MAX, { message: `Description can be at most ${GROUP_DESCRIPTION_MAX} characters` })
    @IsString()
    description?: string;

    @ApiProperty({
        type: [String],
        description: `Friend user ids; a single id is also accepted (a group has ${GROUP_MIN_MEMBERS}–${GROUP_MAX_MEMBERS} members including you)`,
    })
    @ToIdList()
    @IsIdList({ message: "Invalid member ids" })
    @IsDefined({ message: "Please select members" })
    members!: string[];

    @ApiPropertyOptional({ format: "uuid", description: "Group picture, uploaded first via POST /assets" })
    @IsOptional()
    @IsUUID("7", { message: "Invalid group picture" })
    avatar_id?: string;
}

/** Only the fields that are sent are changed. */
export class UpdateGroupDto {
    @ApiPropertyOptional({ minLength: 1, maxLength: GROUP_NAME_MAX })
    @SkipIfMissing()
    @Trim()
    @Length(1, GROUP_NAME_MAX, { message: `Group name must be 1–${GROUP_NAME_MAX} characters` })
    @IsString({ message: `Group name must be 1–${GROUP_NAME_MAX} characters` })
    name?: string;

    @ApiPropertyOptional({ maxLength: GROUP_DESCRIPTION_MAX })
    @SkipIfMissing()
    @Trim()
    @MaxLength(GROUP_DESCRIPTION_MAX, { message: `Description can be at most ${GROUP_DESCRIPTION_MAX} characters` })
    @IsString({ message: `Description can be at most ${GROUP_DESCRIPTION_MAX} characters` })
    description?: string;

    @ApiPropertyOptional({ format: "uuid", description: "New group picture, uploaded first via POST /assets" })
    @SkipIfMissing()
    @IsId({ message: "Invalid group picture" })
    avatar_id?: string;
}

export class AddMembersDto {
    @ApiProperty({ type: [String], description: "Friend user ids; a single id is also accepted" })
    @ToIdList()
    @IsIdList({ message: "Please select valid members" })
    @ArrayNotEmpty({ message: "Please select valid members" })
    members!: string[];
}
