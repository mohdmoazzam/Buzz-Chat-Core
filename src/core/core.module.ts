import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { config } from "../config/env";
import { PrismaService } from "./prisma.service";
import { RealtimeService } from "./realtime.service";
import { StorageService } from "./storage.service";
import { TokenService } from "./token.service";

/** App-wide infrastructure, available to every module without importing it. */
@Global()
@Module({
    imports: [JwtModule.register({ secret: config.jwtSecret })],
    providers: [PrismaService, TokenService, StorageService, RealtimeService],
    exports: [PrismaService, TokenService, StorageService, RealtimeService],
})
export class CoreModule {}
