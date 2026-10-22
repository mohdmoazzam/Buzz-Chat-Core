import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsInt, Max, Min } from "class-validator";
import { VOICE_MAX_MS, VOICE_WAVEFORM_BARS } from "../../common/constants";

// Multipart text fields arrive as strings

/** The text fields sent with a voice message's audio (multipart field "file"). */
export class VoiceUploadDto {
    @ApiProperty({ minimum: 1, maximum: VOICE_MAX_MS, description: "Length of the recording in milliseconds" })
    @Transform(({ value }) => Number(value))
    @Max(VOICE_MAX_MS, { message: "Voice messages can be up to 5 minutes long" })
    @Min(1)
    @IsInt({ message: "Please record a voice message" })
    duration_ms!: number;

    @ApiProperty({ type: String, example: "12,40,87,33", description: `Up to ${VOICE_WAVEFORM_BARS} bar heights (0-100), comma separated` })
    @Transform(({ value }) => (typeof value === "string" ? value.split(",").map(Number) : value))
    @IsInt({ each: true })
    @Min(0, { each: true })
    @Max(100, { each: true })
    @ArrayMaxSize(VOICE_WAVEFORM_BARS)
    @ArrayNotEmpty()
    @IsArray()
    waveform!: number[];
}
