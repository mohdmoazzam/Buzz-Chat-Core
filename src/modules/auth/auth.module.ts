import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { UserModule } from "../user/user.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { EmailVerificationController } from "./email-verification.controller";
import { EmailVerificationService } from "./email-verification.service";
import { JwtStrategy } from "./jwt.strategy";
import { PasswordResetService } from "./password-reset.service";
import { SessionController } from "./session.controller";

@Module({
    imports: [UserModule, PassportModule],
    controllers: [AuthController, SessionController, EmailVerificationController],
    providers: [AuthService, PasswordResetService, EmailVerificationService, JwtStrategy],
})
export class AuthModule {}
