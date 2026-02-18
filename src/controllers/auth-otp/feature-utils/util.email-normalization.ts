/**
 * Email Normalization Utility
 *
 * Normalizes email addresses for consistent comparison and storage.
 */

export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}
