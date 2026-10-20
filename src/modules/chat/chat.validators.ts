import { body } from "express-validator";
import { GROUP_NAME_MAX } from "./chat.constants.js";

export const newGroupRules = [
    body("name").isString().trim().notEmpty().withMessage("Please enter a group name")
        .isLength({ max: GROUP_NAME_MAX }).withMessage(`Group name can be at most ${GROUP_NAME_MAX} characters`),
    body("members").exists().withMessage("Please select members"),
];
