import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { UserModule } from "../user/user.module";
import { AccountDeletionController } from "./account-deletion.controller";
import { AccountDeletionService } from "./account-deletion.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { EmailVerificationController } from "./email-verification.controller";
import { EmailVerificationService } from "./email-verification.service";
import { GoogleAuthService } from "./google-auth.service";
import { JwtStrategy } from "./jwt.strategy";
import { OtpService } from "./otp.service";
import { PasswordController } from "./password.controller";
import { PasswordResetService } from "./password-reset.service";
import { SessionController } from "./session.controller";

@Module({
    imports: [UserModule, PassportModule],
    controllers: [AuthController, SessionController, EmailVerificationController, PasswordController, AccountDeletionController],
    providers: [
        AuthService,
        OtpService,
        PasswordResetService,
        EmailVerificationService,
        GoogleAuthService,
        AccountDeletionService,
        JwtStrategy,
    ],
})
export class AuthModule {}
