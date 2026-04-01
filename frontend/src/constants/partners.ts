/**
 * Partner email list and helpers.
 *
 * Partners get the standard customer sidebar plus The Board and Tailor,
 * but never see HQ items (Command Center, Organizations, Dream Team).
 */

export const PARTNER_EMAILS = [
  "merideth@dentalemr.com",
  "jay@dentalemr.com",
  "rosanna@dentalemr.com",
];

export function isPartnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return PARTNER_EMAILS.includes(email.toLowerCase());
}

/** Returns the partner org name for a given email, or null. */
export function getPartnerOrg(email: string | null | undefined): string | null {
  if (!email) return null;
  const lower = email.toLowerCase();
  if (lower.endsWith("@dentalemr.com")) return "DentalEMR";
  return null;
}
