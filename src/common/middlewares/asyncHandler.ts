import type { NextFunction, Request, RequestHandler, Response } from "express";

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/** Forwards errors from async handlers to the error middleware. */
export const asyncHandler = (handler: AsyncHandler): RequestHandler => (req, res, next) => {
    handler(req, res, next).catch(next);
};
