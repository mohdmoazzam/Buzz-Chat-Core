import { BadRequestException, ValidationPipe, type ValidationError } from "@nestjs/common";
import { Transform } from "class-transformer";
import { ValidateBy, ValidateIf, type ValidationOptions } from "class-validator";
import { areValidIds, isValidId, toIdList } from "./utils/ids";

// DTO helpers. class-validator runs a property's decorators bottom-up, so put the
// type/required checks last: they report first (a missing name says "Please enter a
// name", not "too long").

/** Trims string input before validation runs. */
export const Trim = () => Transform(({ value }) => (typeof value === "string" ? value.trim() : value));

/** Accepts a single id or a list of ids and turns it into a de-duplicated list. */
export const ToIdList = () => Transform(({ value }) => toIdList(value));

/** One of our ids (a lowercase UUID, see isValidId). */
export const IsId = (options?: ValidationOptions) => ValidateBy({ name: "isId", validator: { validate: isValidId } }, options);

/** A list of our ids. */
export const IsIdList = (options?: ValidationOptions) => ValidateBy({ name: "isIdList", validator: { validate: areValidIds } }, options);

/**
 * For partial updates: validates the field only when the client sent it. Unlike @IsOptional,
 * null is still validated (and rejected), so it can't clear a column by accident.
 */
export const SkipIfMissing = () => ValidateIf((_object, value) => value !== undefined);

const messagesOf = (errors: ValidationError[]): string[] =>
    errors.flatMap((error) => [...Object.values(error.constraints ?? {}), ...messagesOf(error.children ?? [])]);

/** Validates DTO bodies; reports problems as one readable message. */
export const createValidationPipe = () =>
    new ValidationPipe({
        transform: true,
        whitelist: true,
        stopAtFirstError: true,
        exceptionFactory: (errors) => new BadRequestException([...new Set(messagesOf(errors))].join(". ")),
    });
