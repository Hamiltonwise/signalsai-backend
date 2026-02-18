/**
 * Hostname extraction utility for website contact form.
 * Extracts the site subdomain from Origin or Referer headers.
 * e.g. "http://bright-dental.sites.localhost:7777" -> "bright-dental"
 */

import { Request } from "express";

export function extractHostname(req: Request): string | null {
  const origin = req.headers.origin || req.headers.referer || "";
  const match = origin.match(/\/\/([^.]+)\.sites\./);
  return match ? match[1] : null;
}
