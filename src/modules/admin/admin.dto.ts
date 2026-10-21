import { ApiProperty } from "@nestjs/swagger";
import { Allow } from "class-validator";

export class AdminVerifyDto {
    // Not format-checked: anything that isn't the exact key gets the same 401
    @ApiProperty()
    @Allow()
    secret_key?: unknown;
}
