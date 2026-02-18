import type { Response } from "express";

/**
 * Standardized error handler for Monday.com endpoints.
 * Preserves original console.error logging and 500 response shape.
 */
export function handleError(
  res: Response,
  error: any,
  operation: string
): Response {
  console.error(
    `Monday.com ${operation} Error:`,
    error?.response?.data || error?.message || error
  );
  return res
    .status(500)
    .json({ error: `Failed to ${operation.toLowerCase()}` });
}
