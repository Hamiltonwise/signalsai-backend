/**
 * GSC Error Handling Utilities
 * Structured error logging and response creation for GSC operations.
 */

/**
 * Logs a GSC-related error with structured context.
 *
 * @param error - The caught error object
 * @param operation - Description of the operation that failed
 */
export const logGscError = (error: any, operation: string): void => {
  console.error(
    `${operation} Error:`,
    error?.response?.data || error?.message || error
  );
};

/**
 * Creates a standardized GSC error response object.
 *
 * @param operation - Description of the operation that failed
 * @returns Object with error message in the format: { error: "Failed to <operation>" }
 */
export const createErrorResponse = (
  operation: string
): { error: string } => {
  return { error: `Failed to ${operation.toLowerCase()}` };
};
