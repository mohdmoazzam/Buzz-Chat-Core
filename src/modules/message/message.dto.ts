import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayNotEmpty, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from "class-validator";
import { FORWARD_MAX_CHATS, MESSAGE_MAX, UPLOAD_MAX_FILES } from "../../common/constants";
import { ToIdList, Trim } from "../../common/validation";

// Text messages are sent over the socket (NEW_MESSAGE); these are the HTTP-only actions.

export class SendAttachmentsDto {
    @ApiProperty({ type: [String], maxItems: UPLOAD_MAX_FILES })
    @ToIdList()
    @IsUUID("7", { each: true })
    @ArrayMaxSize(UPLOAD_MAX_FILES)
    @ArrayNotEmpty()
    attachment_ids!: string[];

    @ApiPropertyOptional({ format: "uuid", description: "The message in this chat these files reply to" })
    @IsOptional()
    @IsUUID("7")
    reply_to_id?: string;
}

export class EditMessageDto {
    @ApiProperty({ maxLength: MESSAGE_MAX })
    @Trim()
    @MaxLength(MESSAGE_MAX)
    @IsNotEmpty()
    @IsString()
    content!: string;
}

// A single emoji (with skin tone or ZWJ parts), not arbitrary text
const EMOJI =
    /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator})[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Emoji_Component}\u200d\ufe0f]*$/u;

export class ReactDto {
    @ApiProperty({ example: "👍", maxLength: 16 })
    @IsString()
    @MaxLength(16)
    @Matches(EMOJI, { message: "Pick an emoji to react with" })
    emoji!: string;
}

export class ForwardMessageDto {
    @ApiProperty({ type: [String], maxItems: FORWARD_MAX_CHATS })
    @ToIdList()
    @IsUUID("7", { each: true })
    @ArrayMaxSize(FORWARD_MAX_CHATS)
    @ArrayNotEmpty()
    chat_ids!: string[];
}
