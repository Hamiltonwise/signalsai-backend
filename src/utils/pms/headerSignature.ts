import { createHash } from "crypto";

/**
 * Header signature utilities for PMS column mapping.
 *
 * The signature is a stable hash of a file's column headers — used as the
 * cache key for org-cached and global-library mappings. Two files with the
 * same headers (regardless of order, case, punctuation, or whitespace) hash
 * to the same signature.
 *
 * Pure functions, no I/O.
 */

/**
 * Normalize a single header string for signature inclusion.
 *
 * Steps (order matters):
 *   1. Lowercase
 *   2. Trim
 *   3. Strip non-alphanumeric characters (everything except [a-z0-9])
 *
 * Example:
 *   "Treatment Date "  → "treatmentdate"
 *   " Ins. Adj. Fee. " → "insadjfee"
 *   "Total Writeoffs"  → "totalwriteoffs"
 */
export function normalizeHeader(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
}

/**
 * Produce the SHA-1 hex signature of a header set.
 *
 * Headers are normalized via `normalizeHeader`, sorted lexicographically,
 * and joined with `|` before hashing. Sort step makes the signature
 * order-insensitive: `["Date", "Source"]` and `["Source", "Date"]` produce
 * identical signatures.
 *
 * Returns: 40-char hex string.
 */
export function signHeaders(headers: string[]): string {
  const normalized = headers.map(normalizeHeader);
  const sorted = [...normalized].sort();
  const joined = sorted.join("|");
  return createHash("sha1").update(joined).digest("hex");
}
