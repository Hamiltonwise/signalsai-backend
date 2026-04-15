/**
 * Tracking-key extraction + validation for public leadgen endpoints.
 *
 * The frontend normally sends the key as `X-Leadgen-Key` header. But
 * `navigator.sendBeacon` cannot set custom headers, so on the beacon endpoint
 * the key arrives in the JSON body as `{ key: "..." }` instead. Both shapes
 * are accepted here so one validator fits all three routes.
 *
 * This is NOT a replacement for real auth — it's a shared-secret gate to
 * drop low-effort traffic. Admin routes still use `authenticateToken` +
 * `superAdminMiddleware`.
 */

import { Request } from "express";

/**
 * Pulls the tracking key from the request. Checks the `X-Leadgen-Key` header
 * first, then falls back to `req.body.key` for sendBeacon compatibility.
 */
export function extractTrackingKey(req: Request): string | null {
  const headerKey = req.headers["x-leadgen-key"];
  if (typeof headerKey === "string" && headerKey.length > 0) {
    return headerKey;
  }
  const bodyKey = req.body?.key;
  if (typeof bodyKey === "string" && bodyKey.length > 0) {
    return bodyKey;
  }
  return null;
}

/**
 * Compares the extracted key against `LEADGEN_TRACKING_KEY`. Returns false
 * when either the env var is missing or the provided key doesn't match.
 */
export function validateTrackingKey(req: Request): boolean {
  const expected = process.env.LEADGEN_TRACKING_KEY;
  if (!expected) {
    return false;
  }
  const provided = extractTrackingKey(req);
  return provided !== null && provided === expected;
}
