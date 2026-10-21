import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { config } from "../config/env";
import { MailService } from "./mail.service";
import { PrismaService } from "./prisma.service";
import { RealtimeService } from "./realtime.service";
import { SessionService } from "./session.service";
import { StorageService } from "./storage.service";
import { TokenService } from "./token.service";

/** App-wide infrastructure, available to every module without importing it. */
@Global()
@Module({
    imports: [JwtModule.register({ secret: config.jwtSecret })],
    providers: [PrismaService, TokenService, SessionService, StorageService, RealtimeService, MailService],
    exports: [PrismaService, TokenService, SessionService, StorageService, RealtimeService, MailService],
})
export class CoreModule {}
