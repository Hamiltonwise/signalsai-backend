/**
 * HTML Sanitizer Utility
 *
 * Sanitizes code snippets for Header/Footer Code Management (HFCM).
 * Allows script, style, link, meta, noscript, iframe tags with specific attributes.
 */

import sanitizeHtml from "sanitize-html";

export interface SanitizeResult {
  sanitized: string;
  isValid: boolean;
  error?: string;
}

export function sanitizeCodeSnippet(code: string): SanitizeResult {
  try {
    const sanitized = sanitizeHtml(code, {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat([
        "script",
        "style",
        "link",
        "meta",
        "noscript",
        "iframe",
      ]),
      allowedAttributes: {
        ...sanitizeHtml.defaults.allowedAttributes,
        script: [
          "src",
          "type",
          "async",
          "defer",
          "crossorigin",
          "integrity",
        ],
        link: [
          "rel",
          "href",
          "type",
          "sizes",
          "media",
          "crossorigin",
          "integrity",
        ],
        meta: ["name", "content", "property", "charset", "http-equiv"],
        iframe: [
          "src",
          "width",
          "height",
          "frameborder",
          "allowfullscreen",
          "loading",
        ],
        "*": ["class", "id", "data-*"],
      },
      allowedSchemes: ["http", "https", "mailto", "tel"],
      allowedSchemesByTag: {
        script: ["https"],
        link: ["https"],
      },
      allowVulnerableTags: true,
    });

    if (!sanitized.trim()) {
      return { sanitized: "", isValid: false, error: "Code cannot be empty" };
    }

    return { sanitized, isValid: true };
  } catch (error: any) {
    return {
      sanitized: "",
      isValid: false,
      error: error.message || "Invalid HTML",
    };
  }
}
