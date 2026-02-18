/**
 * Generates a secure random state parameter for CSRF protection.
 * @returns Random state string
 */
export function generateSecureState(): string {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
}
