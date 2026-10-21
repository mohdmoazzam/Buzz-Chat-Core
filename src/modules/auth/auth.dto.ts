import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, Length, Matches, MaxLength } from "class-validator";
import { Trim } from "../../common/validation";
import {
    BIO_MAX,
    NAME_MAX,
    PASSWORD_MAX,
    PASSWORD_MIN,
    PASSWORD_RULE_MESSAGE,
    USERNAME_REGEX,
    USERNAME_RULE_MESSAGE,
} from "../../common/constants";

// class-validator runs decorators bottom-up, so the type/required checks sit last
// and report first (a missing bio says "Please enter a bio", not "too long").

export class RegisterDto {
    @ApiProperty({ format: "email", maxLength: 254 })
    @Trim()
    @MaxLength(254, { message: "Please enter a valid email address" })
    @IsEmail({}, { message: "Please enter a valid email address" })
    @IsString({ message: "Please enter your email" })
    email!: string;

    @ApiProperty({ maxLength: NAME_MAX })
    @Trim()
    @MaxLength(NAME_MAX, { message: `First name can be at most ${NAME_MAX} characters` })
    @IsNotEmpty({ message: "Please enter your first name" })
    @IsString({ message: "Please enter your first name" })
    first_name!: string;

    @ApiPropertyOptional({ maxLength: NAME_MAX })
    @IsOptional()
    @Trim()
    @MaxLength(NAME_MAX, { message: `Last name can be at most ${NAME_MAX} characters` })
    @IsString({ message: "Please enter a valid last name" })
    last_name?: string;

    @ApiProperty({ pattern: USERNAME_REGEX.source, example: "ada_l" })
    @Trim()
    @IsString({ message: USERNAME_RULE_MESSAGE })
    @Matches(USERNAME_REGEX, { message: USERNAME_RULE_MESSAGE })
    username!: string;

    @ApiProperty({ maxLength: BIO_MAX })
    @Trim()
    @MaxLength(BIO_MAX, { message: `Bio can be at most ${BIO_MAX} characters` })
    @IsNotEmpty({ message: "Please enter a bio" })
    @IsString({ message: "Please enter a bio" })
    bio!: string;

    @ApiProperty({ format: "password", minLength: PASSWORD_MIN, maxLength: PASSWORD_MAX })
    @IsString({ message: PASSWORD_RULE_MESSAGE })
    @Length(PASSWORD_MIN, PASSWORD_MAX, { message: PASSWORD_RULE_MESSAGE })
    password!: string;

    @ApiProperty({ format: "uuid", description: "Profile photo, uploaded first via POST /assets" })
    @IsUUID("7", { message: "Please add a profile photo" })
    avatar_id!: string;
}

export class ForgotPasswordDto {
    @ApiProperty({ format: "email", maxLength: 254 })
    @Trim()
    @MaxLength(254, { message: "Please enter a valid email address" })
    @IsEmail({}, { message: "Please enter a valid email address" })
    @IsString({ message: "Please enter your email" })
    email!: string;
}

export class ResetPasswordDto extends ForgotPasswordDto {
    @ApiProperty({ pattern: "^[0-9]{6}$", example: "123456", description: "The code emailed by POST /user/forgot-password" })
    @Trim()
    @Matches(/^[0-9]{6}$/, { message: "Please enter the 6-digit code from the email" })
    @IsString({ message: "Please enter the 6-digit code from the email" })
    otp!: string;

    @ApiProperty({ format: "password", minLength: PASSWORD_MIN, maxLength: PASSWORD_MAX })
    @IsString({ message: PASSWORD_RULE_MESSAGE })
    @Length(PASSWORD_MIN, PASSWORD_MAX, { message: PASSWORD_RULE_MESSAGE })
    password!: string;
}

export class LoginDto {
    @ApiProperty()
    @Trim()
    @IsString({ message: "Please enter your username" })
    @IsNotEmpty({ message: "Please enter your username" })
    username!: string;

    @ApiProperty({ format: "password" })
    @IsString({ message: "Please enter your password" })
    @IsNotEmpty({ message: "Please enter your password" })
    password!: string;
}
