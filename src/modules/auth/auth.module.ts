import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { UserModule } from "../user/user.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./jwt.strategy";
import { PasswordResetService } from "./password-reset.service";
import { SessionController } from "./session.controller";

@Module({
    imports: [UserModule, PassportModule],
    controllers: [AuthController, SessionController],
    providers: [AuthService, PasswordResetService, JwtStrategy],
})
export class AuthModule {}
