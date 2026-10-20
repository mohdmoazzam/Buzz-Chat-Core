import { body } from "express-validator";
import {
    BIO_MAX, NAME_MAX, PASSWORD_MAX, PASSWORD_MIN, USERNAME_REGEX, USERNAME_RULE_MESSAGE,
} from "../user/user.constants.js";

export const registerRules = [
    body("name").isString().trim().notEmpty().withMessage("Please enter your name")
        .isLength({ max: NAME_MAX }).withMessage(`Name can be at most ${NAME_MAX} characters`),
    body("username").isString().trim().matches(USERNAME_REGEX).withMessage(USERNAME_RULE_MESSAGE),
    body("bio").isString().trim().notEmpty().withMessage("Please enter a bio")
        .isLength({ max: BIO_MAX }).withMessage(`Bio can be at most ${BIO_MAX} characters`),
    body("password").isString().isLength({ min: PASSWORD_MIN, max: PASSWORD_MAX })
        .withMessage(`Password must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters`),
];

export const loginRules = [
    body("username").isString().trim().notEmpty().withMessage("Please enter your username"),
    body("password").isString().notEmpty().withMessage("Please enter your password"),
];
