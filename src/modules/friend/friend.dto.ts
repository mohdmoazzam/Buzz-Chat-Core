import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean, IsOptional, IsUUID } from "class-validator";

export class SendFriendRequestDto {
    @ApiProperty({ format: "uuid" })
    @IsUUID("7")
    user_id!: string;
}

export class RespondToRequestDto {
    @ApiProperty({ required: false })
    @IsOptional()
    @Transform(({ value }) => value === true || value === "true")
    @IsBoolean()
    accept?: boolean;
}
