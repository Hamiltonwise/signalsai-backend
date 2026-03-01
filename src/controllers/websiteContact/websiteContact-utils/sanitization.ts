/**
 * Input sanitization utility for website contact form.
 * Uses sanitize-html to strip all HTML tags, attributes, and entities.
 */

import sanitizeHtml from "sanitize-html";

export function sanitize(str: string): string {
  return sanitizeHtml(str, { allowedTags: [], allowedAttributes: {} }).trim();
}
