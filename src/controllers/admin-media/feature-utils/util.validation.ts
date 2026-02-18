/**
 * Admin Media Validation Utilities
 *
 * MIME type whitelist validation for media uploads.
 */

import { ALLOWED_MIME_TYPES } from "./util.constants";

/**
 * Validate MIME type against whitelist
 */
export function validateMimeType(mimeType: string): boolean {
  return ALLOWED_MIME_TYPES.includes(mimeType);
}
