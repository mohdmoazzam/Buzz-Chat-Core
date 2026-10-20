import {
  Controller,
  Post,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { UPLOAD_MAX_FILES, UPLOAD_RATE_LIMIT_MESSAGE } from "../../common/constants";
import { OptionalJwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RateLimit } from "../../common/guards/rate-limit.guard";
import { FilesUpload } from "../../common/interceptors/upload.interceptors";
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
  @ApiOperation({ summary: `Upload up to ${UPLOAD_MAX_FILES} files; returns asset ids for other routes` })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["files"],
      properties: { files: { type: "array", items: { type: "string", format: "binary" } } },
    },
  })
  async upload(
    @Req() req: Request,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    const assets = await this.assets.upload(files ?? [], req.user?.id ?? null);
    return { success: true, assets };
  }
}
