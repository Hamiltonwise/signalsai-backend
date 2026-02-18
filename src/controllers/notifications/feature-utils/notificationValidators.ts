/**
 * Notification validation utilities.
 *
 * Pure validation functions with no side effects or external dependencies.
 * Each returns a result object indicating validity and any error details.
 */

interface ValidationResult {
  valid: boolean;
  error?: string;
}

interface NotificationIdValidationResult extends ValidationResult {
  notificationId?: number;
}

interface CreateNotificationValidationResult {
  valid: boolean;
  errors?: string[];
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

/**
 * Validates presence of a google account ID.
 * Accepts values from query params, headers, or request body.
 *
 * @param googleAccountId - Value from request (query, header, or body)
 * @returns Validity result with error message if missing
 */
export function validateGoogleAccountId(
  googleAccountId: unknown
): ValidationResult {
  if (!googleAccountId) {
    return {
      valid: false,
      error: "googleAccountId is required",
    };
  }
  return { valid: true };
}

/**
 * Validates required fields for notification creation requests.
 * Requires domain_name and title at minimum.
 *
 * @param body - Request body from POST /api/notifications
 * @returns Validity result with list of missing field errors
 */
export function validateCreateNotificationRequest(
  body: { domain_name?: string; title?: string }
): CreateNotificationValidationResult {
  if (!body.domain_name || !body.title) {
    return {
      valid: false,
      errors: ["domain_name and title are required"],
    };
  }
  return { valid: true };
}
