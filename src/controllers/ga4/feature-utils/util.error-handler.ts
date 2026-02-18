/**
 * GA4 Error Handler Utilities
 *
 * Centralized error handling for GA4 operations.
 * Preserves original logging format for production monitoring.
 */

import { Response } from "express";

/**
 * Extracts a useful error message from various error shapes,
 * including Google API errors with response.data.
 */
export const formatErrorMessage = (error: any): any => {
  return error?.response?.data || error?.message || error;
};

/**
 * Logs an error with the operation context.
 */
export const logError = (operation: string, error: any): void => {
  console.error(`${operation} Error:`, formatErrorMessage(error));
};

/**
 * Handles an error by logging it and sending a 500 response.
 * Preserves the exact response shape from the original route file.
 *
 * @param res - Express response object
 * @param error - The caught error
 * @param operation - Name of the operation that failed (used in log and response)
 */
export const handleError = (
  res: Response,
  error: any,
  operation: string
): Response => {
  logError(operation, error);
  return res
    .status(500)
    .json({ error: `Failed to ${operation.toLowerCase()}` });
};
