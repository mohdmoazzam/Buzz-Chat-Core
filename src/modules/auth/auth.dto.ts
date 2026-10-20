import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, Length, Matches, MaxLength } from "class-validator";
import { Trim } from "../../common/validation";
import {
    BIO_MAX, NAME_MAX, PASSWORD_MAX, PASSWORD_MIN, USERNAME_REGEX, USERNAME_RULE_MESSAGE,
} from "../user/user.constants";

// class-validator runs decorators bottom-up, so the type/required checks sit last
// and report first (a missing bio says "Please enter a bio", not "too long").

const PASSWORD_RULE_MESSAGE = `Password must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters`;

export class RegisterDto {
    @Trim()
    @MaxLength(254, { message: "Please enter a valid email address" })
    @IsEmail({}, { message: "Please enter a valid email address" })
    @IsString({ message: "Please enter your email" })
    email!: string;

    @Trim()
    @MaxLength(NAME_MAX, { message: `First name can be at most ${NAME_MAX} characters` })
    @IsNotEmpty({ message: "Please enter your first name" })
    @IsString({ message: "Please enter your first name" })
    first_name!: string;

    @IsOptional()
    @Trim()
    @MaxLength(NAME_MAX, { message: `Last name can be at most ${NAME_MAX} characters` })
    @IsString({ message: "Please enter a valid last name" })
    last_name?: string;

    @Trim()
    @IsString({ message: USERNAME_RULE_MESSAGE })
    @Matches(USERNAME_REGEX, { message: USERNAME_RULE_MESSAGE })
    username!: string;

    @Trim()
    @MaxLength(BIO_MAX, { message: `Bio can be at most ${BIO_MAX} characters` })
    @IsNotEmpty({ message: "Please enter a bio" })
    @IsString({ message: "Please enter a bio" })
    bio!: string;

    @IsString({ message: PASSWORD_RULE_MESSAGE })
    @Length(PASSWORD_MIN, PASSWORD_MAX, { message: PASSWORD_RULE_MESSAGE })
    password!: string;

    /** Profile photo, uploaded first via POST /assets. */
    @IsUUID("7", { message: "Please add a profile photo" })
    avatar_id!: string;
}

export class LoginDto {
    @Trim()
    @IsString({ message: "Please enter your username" })
    @IsNotEmpty({ message: "Please enter your username" })
    username!: string;

    @IsString({ message: "Please enter your password" })
    @IsNotEmpty({ message: "Please enter your password" })
    password!: string;
}
