/**
 * Super Admin Service
 *
 * Determines if an email belongs to a super admin.
 * Parses SUPER_ADMIN_EMAILS env var (comma-separated list).
 */

export function isSuperAdmin(email: string): boolean {
  const superAdminEmails = (process.env.SUPER_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);

  return superAdminEmails.includes(email.toLowerCase());
}
