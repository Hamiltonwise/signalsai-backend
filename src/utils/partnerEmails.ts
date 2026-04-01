/**
 * Partner email validation utility.
 *
 * Identifies partner users (e.g., DentalEMR team) who get access
 * to The Board and Tailor without being super admins.
 */

const PARTNER_DOMAINS = ["dentalemr.com"];

export function isPartnerEmail(email: string): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  return PARTNER_DOMAINS.some((d) => lower.endsWith(`@${d}`));
}

export function getPartnerOrgType(email: string): string | null {
  if (!email) return null;
  const lower = email.toLowerCase();
  if (lower.endsWith("@dentalemr.com")) return "dentalemr";
  return null;
}
