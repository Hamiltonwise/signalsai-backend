/**
 * URL normalization utility for the scraper module.
 *
 * Ensures bare domains (e.g. "example.com") are prefixed with https://.
 * Does not alter URLs that already have a protocol.
 */

/**
 * Normalize a domain string into a fully-qualified URL.
 *
 * - Trims whitespace
 * - Prepends `https://` if no protocol is present
 * - Leaves existing `http://` or `https://` intact
 */
export function normalizeUrl(domain: string): string {
  let url = domain.trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }
  return url;
}
