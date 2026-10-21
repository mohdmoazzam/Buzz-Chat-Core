import { ApiProperty } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayNotEmpty, IsNotEmpty, IsString, IsUUID, MaxLength } from "class-validator";
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
}

export class EditMessageDto {
    @ApiProperty({ maxLength: MESSAGE_MAX })
    @Trim()
    @MaxLength(MESSAGE_MAX)
    @IsNotEmpty()
    @IsString()
    content!: string;
}

export class ForwardMessageDto {
    @ApiProperty({ type: [String], maxItems: FORWARD_MAX_CHATS })
    @ToIdList()
    @IsUUID("7", { each: true })
    @ArrayMaxSize(FORWARD_MAX_CHATS)
    @ArrayNotEmpty()
    chat_ids!: string[];
}
