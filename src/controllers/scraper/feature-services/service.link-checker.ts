/**
 * Broken link detection service for the scraper module.
 *
 * Extracts all <a href> links from a page, then checks each via HTTP HEAD.
 * Links returning 4xx/5xx, timing out, or failing to connect are reported
 * as broken. Checks run in batches of 5 to avoid overwhelming servers.
 */

import { Page } from "puppeteer";
import https from "https";
import http from "http";
import { BrokenLink } from "../feature-utils/scraper.types";
import { log } from "../feature-utils/util.scraper-logger";

/**
 * Extract all unique links from anchor tags on the page.
 *
 * Excludes fragment-only (#), javascript:, mailto:, and tel: hrefs.
 * Deduplicates results.
 */
export async function extractPageLinks(page: Page): Promise<string[]> {
  const links = await page.evaluate(() => {
    const anchors = document.querySelectorAll("a[href]");
    const hrefs: string[] = [];

    anchors.forEach((anchor) => {
      const href = anchor.getAttribute("href");
      if (
        href &&
        !href.startsWith("#") &&
        !href.startsWith("javascript:") &&
        !href.startsWith("mailto:") &&
        !href.startsWith("tel:")
      ) {
        hrefs.push(href);
      }
    });

    return hrefs;
  });

  return [...new Set(links)];
}

/**
 * Check a single link's status via HTTP HEAD request.
 *
 * - Resolves relative URLs against `baseUrl`
 * - 5-second timeout
 * - Returns broken link info for 4xx/5xx/timeout/connection_error
 * - Returns null if the link is OK (2xx/3xx)
 */
export async function checkLinkStatus(
  linkUrl: string,
  baseUrl: string
): Promise<BrokenLink | null> {
  return new Promise((resolve) => {
    try {
      let fullUrl: string;
      try {
        fullUrl = new URL(linkUrl, baseUrl).href;
      } catch {
        resolve({ url: linkUrl, status: "invalid_url" });
        return;
      }

      const isHttps = fullUrl.startsWith("https://");
      const protocol = isHttps ? https : http;

      const request = protocol.request(
        fullUrl,
        {
          method: "HEAD",
          timeout: 5000,
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; LinkChecker/1.0)",
          },
        },
        (response) => {
          const status = response.statusCode || 0;
          if (status >= 400) {
            resolve({ url: fullUrl, status });
          } else {
            resolve(null);
          }
        }
      );

      request.on("error", () => {
        resolve({ url: fullUrl, status: "connection_error" });
      });

      request.on("timeout", () => {
        request.destroy();
        resolve({ url: fullUrl, status: "timeout" });
      });

      request.end();
    } catch (error) {
      resolve({ url: linkUrl, status: "error" });
    }
  });
}

/**
 * Find broken links on a page.
 *
 * Extracts all links, then checks them in batches of 5.
 * Stops once `maxBrokenLinks` broken links have been found.
 *
 * @param page - Puppeteer Page instance
 * @param baseUrl - Base URL for resolving relative links
 * @param maxBrokenLinks - Maximum number of broken links to report (default: 10)
 */
export async function findBrokenLinks(
  page: Page,
  baseUrl: string,
  maxBrokenLinks: number = 10
): Promise<BrokenLink[]> {
  const links = await extractPageLinks(page);
  const brokenLinks: BrokenLink[] = [];

  log("DEBUG", `Checking ${links.length} links for broken URLs`);

  const batchSize = 5;
  for (
    let i = 0;
    i < links.length && brokenLinks.length < maxBrokenLinks;
    i += batchSize
  ) {
    const batch = links.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((link) => checkLinkStatus(link, baseUrl))
    );

    for (const result of results) {
      if (result && brokenLinks.length < maxBrokenLinks) {
        brokenLinks.push(result);
      }
    }
  }

  return brokenLinks;
}
