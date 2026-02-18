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
  getPageName,
  extractInternalLinks,
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

  // Fetch home page
  const homeHtml = await fetchPage(url);
  if (!homeHtml) {
    scrapeLogger.error("Failed to fetch home page", { url });
    return {
      error: { status: 500, message: "Failed to fetch home page" },
    };
  }

  // Extract internal links
  const internalLinks = extractInternalLinks(homeHtml, baseUrl);
  scrapeLogger.info("Found internal links", { count: internalLinks.length });

  const pages: Record<string, string> = {};
  const homeImages: string[] = [];
  const otherImages: string[] = [];

  pages["home"] = homeHtml;
  homeImages.push(...extractImages(homeHtml, baseUrl));

  // Fetch linked pages (max 10)
  const linksToFetch = internalLinks.slice(0, 10);
  await Promise.all(
    linksToFetch.map(async (link) => {
      const html = await fetchPage(link);
      if (html) {
        const pageName = getPageName(link);
        const uniqueName = pages[pageName]
          ? `${pageName}-${Date.now()}`
          : pageName;
        pages[uniqueName] = html;
        otherImages.push(...extractImages(html, baseUrl));
      }
    })
  );

  // Deduplicate and cap images at 10
  const uniqueHomeImages = [...new Set(homeImages)];
  const uniqueOtherImages = [...new Set(otherImages)].filter(
    (img) => !uniqueHomeImages.includes(img)
  );

  let selectedImages: string[];
  if (uniqueHomeImages.length >= 10) {
    selectedImages = [...uniqueHomeImages]
      .sort(() => Math.random() - 0.5)
      .slice(0, 10);
  } else {
    const remaining = 10 - uniqueHomeImages.length;
    const otherSelected = [...uniqueOtherImages]
      .sort(() => Math.random() - 0.5)
      .slice(0, remaining);
    selectedImages = [...uniqueHomeImages, ...otherSelected];
  }

  const allContent = Object.values(pages).join("");
  const charLength = allContent.length;
  const tokens = estimateTokens(allContent);
  const elapsedMs = Date.now() - startTime;

  scrapeLogger.info("Scrape completed", {
    baseUrl,
    pagesScraped: Object.keys(pages).length,
    homepageImages: uniqueHomeImages.length,
    otherImages: uniqueOtherImages.length,
    selectedImages: selectedImages.length,
    charLength,
    estimatedTokens: tokens,
    elapsedMs,
  });

  return {
    result: {
      baseUrl,
      pages,
      images: selectedImages,
      elapsedMs,
      charLength,
      estimatedTokens: tokens,
    },
  };
}
