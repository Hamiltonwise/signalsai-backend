/**
 * CSV formatting helpers for the admin leadgen CSV export.
 *
 * Keep this dependency-free. The controller streams to `res.write()` rather
 * than buffering the whole dataset.
 */

import { Response } from "express";

/**
 * RFC 4180-ish CSV escape. Wraps a field in double-quotes when it contains
 * a comma, quote, or newline. Inner quotes are doubled.
 *
 *   hello, world     → "hello, world"
 *   "quoted"         → """quoted"""
 *   multi\nline      → "multi\nline"
 *   plain            → plain
 *   null/undefined   → (empty string)
 */
export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return "";

  let str: string;
  if (value instanceof Date) {
    str = value.toISOString();
  } else if (typeof value === "object") {
    try {
      str = JSON.stringify(value);
    } catch {
      str = String(value);
    }
  } else {
    str = String(value);
  }

  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Writes one CSV row (plus trailing newline) to the response stream.
 */
export function writeCsvRow(res: Response, fields: unknown[]): void {
  const line = fields.map(escapeCsvField).join(",") + "\n";
  res.write(line);
}
