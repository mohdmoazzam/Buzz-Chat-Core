import { body, validationResult, check } from "express-validator";
import { ErrorHandler } from "./utility.js";

const registervalidator = () => [
    body("name", "Please enter name").notEmpty(),
    body("username", "Please enter username").notEmpty(),
    body("bio", "Please enter bio").notEmpty(),
    body("password", "Please enter password").notEmpty()
];

const loginvalidator = () => [
    body("username", "Please enter username").notEmpty(),
    body("password", "Please enter password").notEmpty(),
];

const newGroupValidator = () => [
    body("name", "Please enter name").notEmpty(),
    body("members").notEmpty().withMessage("Please enter members").isArray(),
];

const validateHandler = (req, res, next) => {
    const errors = validationResult(req);
    const errorMessages = errors.array().map((err) => err.msg).join(", ");
    console.log(errors);
    if (errors.isEmpty()) return next();
    else next(new ErrorHandler(errorMessages, 400));
}

export { registervalidator, validateHandler, loginvalidator, newGroupValidator };