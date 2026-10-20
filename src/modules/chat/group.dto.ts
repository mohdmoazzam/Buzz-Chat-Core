import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDefined, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { Trim } from "../../common/validation";
import { GROUP_DESCRIPTION_MAX, GROUP_MAX_MEMBERS, GROUP_MIN_MEMBERS, GROUP_NAME_MAX } from "../../common/constants";

export class CreateGroupDto {
    @ApiProperty({ maxLength: GROUP_NAME_MAX })
    @Trim()
    // Validators run bottom-up: a missing name reports "Please enter a group name", not "too long"
    @MaxLength(GROUP_NAME_MAX, { message: `Group name can be at most ${GROUP_NAME_MAX} characters` })
    @IsNotEmpty({ message: "Please enter a group name" })
    @IsString({ message: "Please enter a group name" })
    name!: string;

    @ApiPropertyOptional({ maxLength: GROUP_DESCRIPTION_MAX })
    @IsOptional()
    @IsString()
    description?: string;

    /** A single id or a list of ids. */
    @ApiProperty({
        type: [String],
        description: `Friend user ids (a group has ${GROUP_MIN_MEMBERS}–${GROUP_MAX_MEMBERS} members including you)`,
    })
    @IsDefined({ message: "Please select members" })
    members!: unknown;

    /** Group picture, uploaded first via POST /assets. */
    @ApiPropertyOptional({ format: "uuid", description: "Group picture, uploaded first via POST /assets" })
    @IsOptional()
    @IsUUID("7", { message: "Invalid group picture" })
    avatar_id?: string;
}

export interface AddMembersBody {
    chat_id?: unknown;
    members?: unknown;
}

export interface RemoveMemberBody {
    chat_id?: unknown;
    user_id?: unknown;
}

export interface UpdateGroupBody {
    name?: unknown;
    description?: unknown;
    /** New group picture, uploaded first via POST /assets. */
    avatar_id?: unknown;
}
