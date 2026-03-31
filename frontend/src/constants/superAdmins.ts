/**
 * Super admin email list -- single source of truth.
 * Import this everywhere instead of duplicating the list.
 */
export const SUPER_ADMIN_EMAILS = [
  "corey@getalloro.com",
  "info@getalloro.com",
  "demo@getalloro.com",
  "jo@getalloro.com",
  "jordan@getalloro.com",
  "dave@getalloro.com",
];

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return SUPER_ADMIN_EMAILS.includes(email.toLowerCase());
}
