import { z } from "zod";

/**
 * An optional free-text form field.
 *
 * HTML forms submit an untouched field as "", not as absent. `.optional()`
 * alone would store that empty string, so this maps both "" and undefined to
 * undefined and trims what remains.
 */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));
