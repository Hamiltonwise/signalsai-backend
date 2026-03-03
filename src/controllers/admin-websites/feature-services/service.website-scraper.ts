/**
 * Website Scraper Service
 *
 * Multi-page website scraping with internal link discovery,
 * image extraction, token estimation, and file-based logging.
 */

import {
  scrapeLogger,
  estimateTokens,
  fetchPage,
  extractImages,
} from "../feature-utils/util.scraper-helpers";

// ---------------------------------------------------------------------------
// Scrape a website
// ---------------------------------------------------------------------------

export async function scrapeWebsite(
  url: string,
  scraperKey: string | string[] | undefined
): Promise<{
  result?: {
    baseUrl: string;
    pages: Record<string, string>;
    images: string[];
    elapsedMs: number;
    charLength: number;
    estimatedTokens: number;
  };
  error?: { status: number; message: string };
}> {
  const startTime = Date.now();

  // Validate scraper API key
  const expectedKey = process.env.SCRAPER_API_KEY;
  if (expectedKey && scraperKey !== expectedKey) {
    return {
      error: { status: 401, message: "Unauthorized" },
    };
  }

  if (!url || typeof url !== "string") {
    return {
      error: { status: 400, message: "URL is required" },
    };
  }

  let baseUrl: string;
  try {
    baseUrl = new URL(url).origin;
  } catch {
    return {
      error: { status: 400, message: "Invalid URL" },
    };
  }

  scrapeLogger.info("Starting scrape", { url, baseUrl });

  // Fetch the given page only
  const html = await fetchPage(url);
  if (!html) {
    scrapeLogger.error("Failed to fetch page", { url });
    return {
      error: { status: 500, message: "Failed to fetch page" },
    };
  }

  const pages: Record<string, string> = { home: html };
  const images = [...new Set(extractImages(html, baseUrl))].slice(0, 10);

  const charLength = html.length;
  const tokens = estimateTokens(html);
  const elapsedMs = Date.now() - startTime;

  scrapeLogger.info("Scrape completed", {
    baseUrl,
    images: images.length,
    charLength,
    estimatedTokens: tokens,
    elapsedMs,
  });

  return {
    result: {
      baseUrl,
      pages,
      images,
      elapsedMs,
      charLength,
      estimatedTokens: tokens,
    },
  };
}
