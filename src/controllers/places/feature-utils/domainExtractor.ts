/**
 * Extract a clean domain from a website URL.
 * Strips the www. prefix and handles null/invalid URLs.
 */
export function extractDomainFromUrl(websiteUri: string | null | undefined): string {
  if (!websiteUri) {
    return "";
  }

  try {
    const url = new URL(websiteUri);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return websiteUri;
  }
}
