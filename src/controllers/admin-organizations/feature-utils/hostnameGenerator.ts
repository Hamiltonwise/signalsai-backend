/**
 * Hostname Generator
 *
 * Generates a hostname from an organization name.
 * Normalizes to lowercase, replaces non-alphanumeric with hyphens,
 * trims leading/trailing hyphens, limits to 30 chars, appends random suffix.
 */

/**
 * Generate a hostname from an organization name.
 * Matches the original logic from the tier upgrade endpoint.
 */
export function generate(orgName: string): string {
  const baseHostname = orgName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 30);
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `${baseHostname}-${randomSuffix}`;
}
