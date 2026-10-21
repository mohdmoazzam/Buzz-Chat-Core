import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean, IsOptional } from "class-validator";
import { IsId } from "../../common/validation";

export class SendFriendRequestDto {
    @ApiProperty({ format: "uuid", description: "Who to send the request to" })
    @IsId({ message: "Invalid user" })
    user_id!: string;
}

export class RespondToRequestDto {
    @ApiProperty({ required: false, description: "true accepts; anything else, or leaving it out, declines" })
    @IsOptional()
    @Transform(({ value }) => value === true || value === "true")
    @IsBoolean()
    accept?: boolean;
}
