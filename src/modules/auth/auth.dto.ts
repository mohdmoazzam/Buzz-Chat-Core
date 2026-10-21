import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, Length, Matches, MaxLength } from "class-validator";
import { Trim } from "../../common/validation";
import { BIO_MAX, NAME_MAX, PASSWORD_MAX, PASSWORD_MIN, USERNAME_REGEX } from "../../common/constants";

export class RegisterDto {
    @ApiProperty({ format: "email", maxLength: 254 })
    @Trim()
    @MaxLength(254)
    @IsEmail()
    @IsString()
    email!: string;

    @ApiProperty({ maxLength: NAME_MAX })
    @Trim()
    @MaxLength(NAME_MAX)
    @IsNotEmpty()
    @IsString()
    first_name!: string;

    @ApiPropertyOptional({ maxLength: NAME_MAX })
    @IsOptional()
    @Trim()
    @MaxLength(NAME_MAX)
    @IsString()
    last_name?: string;

    @ApiProperty({ pattern: USERNAME_REGEX.source, example: "ada_l" })
    @Trim()
    @IsString()
    @Matches(USERNAME_REGEX)
    username!: string;

    @ApiProperty({ maxLength: BIO_MAX })
    @Trim()
    @MaxLength(BIO_MAX)
    @IsNotEmpty()
    @IsString()
    bio!: string;

    @ApiProperty({ format: "password", minLength: PASSWORD_MIN, maxLength: PASSWORD_MAX })
    @IsString()
    @Length(PASSWORD_MIN, PASSWORD_MAX)
    password!: string;

    @ApiProperty({ format: "uuid" })
    @IsUUID("7")
    avatar_id!: string;
}

export class ForgotPasswordDto {
    @ApiProperty({ format: "email", maxLength: 254 })
    @Trim()
    @MaxLength(254)
    @IsEmail()
    @IsString()
    email!: string;
}

export class ResetPasswordDto extends ForgotPasswordDto {
    @ApiProperty({ pattern: "^[0-9]{6}$", example: "123456" })
    @Trim()
    @Matches(/^[0-9]{6}$/)
    @IsString()
    otp!: string;

    @ApiProperty({ format: "password", minLength: PASSWORD_MIN, maxLength: PASSWORD_MAX })
    @IsString()
    @Length(PASSWORD_MIN, PASSWORD_MAX)
    password!: string;
}

export class LoginDto {
    @ApiProperty()
    @Trim()
    @IsString()
    @IsNotEmpty()
    username!: string;

    @ApiProperty({ format: "password" })
    @IsString()
    @IsNotEmpty()
    password!: string;
}
