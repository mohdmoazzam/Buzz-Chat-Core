import {
  Controller,
  Post,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import type { Request } from "express";
import { OptionalJwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RateLimit } from "../../common/guards/rate-limit.guard";
import { FilesUpload } from "../../common/interceptors/upload.interceptors";
import { AssetsService } from "./assets.service";

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
  @RateLimit(
    60,
    15,
    "Too many uploads. Please wait a few minutes and try again.",
  )
  @UseInterceptors(FilesUpload)
  async upload(
    @Req() req: Request,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    const assets = await this.assets.upload(files ?? [], req.user?.id ?? null);
    return { success: true, assets };
  }
}
