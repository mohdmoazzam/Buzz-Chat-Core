import { Body, Controller, Post, Req, UploadedFile, UploadedFiles, UseGuards, UseInterceptors } from "@nestjs/common";
import { ApiConsumes, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { UPLOAD_RATE_LIMIT_MESSAGE } from "../../common/constants";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard, OptionalJwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RateLimit } from "../../common/guards/rate-limit.guard";
import { FilesUpload, SingleFileUpload } from "../../common/interceptors/upload.interceptors";
import type { AuthUser } from "../user/user.serializer";
import { VoiceUploadDto } from "./assets.dto";
import { AssetsService } from "./assets.service";

@ApiTags("Assets")
@Controller("assets")
export class AssetsController {
    constructor(private readonly assets: AssetsService) {}

    /**
     * Uploads up to 5 files (multipart field "files") and returns their asset records.
     * Other APIs then take the asset ids (avatar_id, attachment_ids) instead of files.
     * Works without a session so the sign-up form can upload its avatar first.
     */
    @Post()
    @UseGuards(OptionalJwtAuthGuard)
    @RateLimit(60, 15, UPLOAD_RATE_LIMIT_MESSAGE)
    @UseInterceptors(FilesUpload)
    @ApiConsumes("multipart/form-data")
    async upload(@Req() req: Request, @UploadedFiles() files?: Express.Multer.File[]) {
        const assets = await this.assets.upload(files ?? [], req.user?.id ?? null);
        return { success: true, assets };
    }

    /**
     * Uploads a recorded voice message (multipart field "file", with duration_ms and waveform)
     * and returns its asset record, which is then sent with attachment_ids.
     */
    @Post("voice")
    @UseGuards(JwtAuthGuard)
    @RateLimit(60, 15, UPLOAD_RATE_LIMIT_MESSAGE)
    @UseInterceptors(SingleFileUpload)
    @ApiConsumes("multipart/form-data")
    async uploadVoice(@CurrentUser() user: AuthUser, @Body() dto: VoiceUploadDto, @UploadedFile() file?: Express.Multer.File) {
        const asset = await this.assets.uploadVoice(file, user.id, { duration_ms: dto.duration_ms, waveform: dto.waveform });
        return { success: true, asset };
    }
}
