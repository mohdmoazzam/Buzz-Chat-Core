import type { NextFunction, Request, Response } from "express";
import { validationResult } from "express-validator";
import { ErrorHandler } from "../errors.js";

/** Runs after express-validator chains; reports problems as one readable message. */
export const validate = (req: Request, _res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (errors.isEmpty()) return next();
    const messages = [...new Set(errors.array().map((err) => String(err.msg)))];
    return next(new ErrorHandler(messages.join(". "), 400));
};
