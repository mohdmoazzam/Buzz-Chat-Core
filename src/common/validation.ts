import { BadRequestException, ValidationPipe, type ValidationError } from "@nestjs/common";
import { Transform } from "class-transformer";

/** Trims string input before validation runs. */
export const Trim = () => Transform(({ value }) => (typeof value === "string" ? value.trim() : value));

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
