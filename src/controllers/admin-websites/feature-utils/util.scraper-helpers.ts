/**
 * Website Scraper Helper Utilities
 *
 * Pure functions for URL parsing, image extraction, token estimation,
 * and file-based scraper logging.
 */

import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// File-based logger for scrape operations
// ---------------------------------------------------------------------------

const LOG_DIR = path.join(__dirname, "../../routes/admin/../logs");
const SCRAPE_LOG_FILE = path.join(LOG_DIR, "website-scrape.log");

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

export const scrapeLogger = {
  _write(level: string, message: string, data?: Record<string, unknown>) {
    const timestamp = new Date().toISOString();
    const dataStr = data ? ` | ${JSON.stringify(data)}` : "";
    const line = `[${timestamp}] [SCRAPE] [${level}] ${message}${dataStr}\n`;
    try {
      fs.appendFileSync(SCRAPE_LOG_FILE, line);
    } catch {
      // Ignore write errors
    }
  },
  info(msg: string, data?: Record<string, unknown>) {
    this._write("INFO", msg, data);
  },
  error(msg: string, data?: Record<string, unknown>) {
    this._write("ERROR", msg, data);
  },
  warn(msg: string, data?: Record<string, unknown>) {
    this._write("WARN", msg, data);
  },
};

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

export function toAbsoluteUrl(href: string, baseUrl: string): string | null {
  try {
    if (
      href.startsWith("mailto:") ||
      href.startsWith("tel:") ||
      href.startsWith("javascript:") ||
      href.startsWith("#")
    ) {
      return null;
    }
    return new URL(href, baseUrl).href;
  } catch {
    return null;
  }
}

export function isInternalUrl(url: string, baseUrl: string): boolean {
  try {
    return new URL(url).hostname === new URL(baseUrl).hostname;
  } catch {
    return false;
  }
}

export function getPageName(url: string): string {
  try {
    const urlPath = new URL(url).pathname;
    if (urlPath === "/" || urlPath === "") return "home";
    const segments = urlPath.split("/").filter(Boolean);
    const last = segments[segments.length - 1] || "page";
    return last.replace(/\.(html?|php|aspx?)$/i, "").toLowerCase();
  } catch {
    return "page";
  }
}

export function isValidImageUrl(url: string): boolean {
  const lower = url.toLowerCase();
  const exts = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".avif"];
  if (exts.some((ext) => lower.includes(ext))) return true;
  if (
    lower.includes("/images/") ||
    lower.includes("/img/") ||
    lower.includes("/media/")
  )
    return true;
  return false;
}

// ---------------------------------------------------------------------------
// Page fetching
// ---------------------------------------------------------------------------

export async function fetchPage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; AlloroBot/1.0; +https://getalloro.com)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return null;
    const ct = response.headers.get("content-type") || "";
    if (!ct.includes("text/html")) return null;
    return await response.text();
  } catch (error) {
    scrapeLogger.error(`Failed to fetch ${url}`, { error: String(error) });
    return null;
  }
}

// ---------------------------------------------------------------------------
// HTML extraction
// ---------------------------------------------------------------------------

export function extractInternalLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const links = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const abs = toAbsoluteUrl(href, baseUrl);
    if (abs && isInternalUrl(abs, baseUrl)) {
      try {
        const u = new URL(abs);
        u.hash = "";
        links.add(u.origin + u.pathname);
      } catch {
        /* skip */
      }
    }
  });
  return Array.from(links);
}

export function extractImages(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const images = new Set<string>();

  $("img[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (src) {
      const abs = toAbsoluteUrl(src, baseUrl);
      if (abs && isValidImageUrl(abs)) images.add(abs);
    }
  });

  $("img[srcset]").each((_, el) => {
    const srcset = $(el).attr("srcset");
    if (srcset) {
      srcset
        .split(",")
        .map((s) => s.trim().split(/\s+/)[0])
        .forEach((url) => {
          const abs = toAbsoluteUrl(url, baseUrl);
          if (abs && isValidImageUrl(abs)) images.add(abs);
        });
    }
  });

  $('[style*="background"]').each((_, el) => {
    const style = $(el).attr("style") || "";
    const match = style.match(/url\(['"]?([^'")\s]+)['"]?\)/);
    if (match && match[1]) {
      const abs = toAbsoluteUrl(match[1], baseUrl);
      if (abs && isValidImageUrl(abs)) images.add(abs);
    }
  });

  return Array.from(images);
}
