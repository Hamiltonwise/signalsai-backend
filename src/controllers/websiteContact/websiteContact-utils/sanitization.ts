/**
 * Input sanitization utility for website contact form.
 * Strips HTML tags from user-provided strings.
 */

export function sanitize(str: string): string {
  return str.replace(/<[^>]*>/g, "").trim();
}
