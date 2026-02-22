/**
 * Notification validation utilities.
 *
 * Pure validation functions with no side effects or external dependencies.
 * Each returns a result object indicating validity and any error details.
 */

interface NotificationIdValidationResult {
  valid: boolean;
  notificationId?: number;
  error?: string;
}

/**
 * Validates and parses a notification ID from route params.
 *
 * @param id - Raw string from req.params.id
 * @returns Parsed numeric ID if valid, or error message if not
 */
export function validateNotificationId(
  id: string
): NotificationIdValidationResult {
  const notificationId = parseInt(id, 10);
  if (isNaN(notificationId)) {
    return {
      valid: false,
      error: "Notification ID must be a valid number",
    };
  }
  return { valid: true, notificationId };
}
