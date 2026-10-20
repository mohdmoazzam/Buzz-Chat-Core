import { Global, Module } from "@nestjs/common";
import { AssetsController } from "./assets.controller";
import { AssetsService } from "./assets.service";

/** Uploaded files; global because users, groups and messages all attach assets. */
@Global()
@Module({
    controllers: [AssetsController],
    providers: [AssetsService],
    exports: [AssetsService],
})
export class AssetsModule {}
