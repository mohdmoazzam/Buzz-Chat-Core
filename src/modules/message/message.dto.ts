import { ApiProperty } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayNotEmpty, IsNotEmpty, IsString, MaxLength } from "class-validator";
import { FORWARD_MAX_CHATS, MESSAGE_MAX, UPLOAD_MAX_FILES } from "../../common/constants";
import { IsIdList, ToIdList, Trim } from "../../common/validation";

// Text messages are sent over the socket (NEW_MESSAGE); these are the HTTP-only actions.

export class SendAttachmentsDto {
    @ApiProperty({
        type: [String],
        maxItems: UPLOAD_MAX_FILES,
        description: "Asset ids, uploaded first via POST /assets; a single id is also accepted",
    })
    @ToIdList()
    @IsIdList({ message: "Invalid attachments" })
    @ArrayMaxSize(UPLOAD_MAX_FILES, { message: `You can send up to ${UPLOAD_MAX_FILES} files at a time` })
    @ArrayNotEmpty({ message: "Please provide attachments" })
    attachment_ids!: string[];
}

export class EditMessageDto {
    @ApiProperty({ maxLength: MESSAGE_MAX })
    @Trim()
    @MaxLength(MESSAGE_MAX, { message: `Messages can be at most ${MESSAGE_MAX} characters` })
    @IsNotEmpty({ message: "Message is empty" })
    @IsString({ message: "Message is empty" })
    content!: string;
}

export class ForwardMessageDto {
    @ApiProperty({ type: [String], maxItems: FORWARD_MAX_CHATS, description: "Chats to forward to; a single id is also accepted" })
    @ToIdList()
    @IsIdList({ message: "Invalid chats" })
    @ArrayMaxSize(FORWARD_MAX_CHATS, { message: `You can forward to up to ${FORWARD_MAX_CHATS} chats at a time` })
    @ArrayNotEmpty({ message: "Please choose a chat to forward to" })
    chat_ids!: string[];
}
