/**
 * Page performance metrics for the scraper module.
 *
 * Uses the browser Performance Timing API to capture load time,
 * and checks the final URL for HTTPS.
 */

import { Page } from "puppeteer";
import { PerformanceMetrics } from "../feature-utils/scraper.types";
import { log } from "../feature-utils/util.scraper-logger";

/**
 * Get the page load time using the Performance Timing API.
 *
 * Calculates `loadEventEnd - navigationStart`. If `loadEventEnd`
 * has not yet fired, falls back to `Date.now() - navigationStart`.
 */
export async function getPageLoadTime(page: Page): Promise<number> {
  const timing = await page.evaluate(() => {
    const perf = performance.timing;
    return {
      navigationStart: perf.navigationStart,
      loadEventEnd: perf.loadEventEnd,
    };
  });

  if (timing.loadEventEnd === 0) {
    return Date.now() - timing.navigationStart;
  }

  return timing.loadEventEnd - timing.navigationStart;
}

/**
 * Check whether the page's final URL uses HTTPS.
 */
export function checkSecure(page: Page): boolean {
  const finalUrl = page.url();
  return finalUrl.startsWith("https://");
}

/**
 * Collect all performance metrics for a loaded page.
 *
 * Returns load time (ms) and HTTPS status.
 */
export async function collectMetrics(page: Page): Promise<PerformanceMetrics> {
  const loadTime = await getPageLoadTime(page);
  const isSecure = checkSecure(page);

  log("INFO", "Page load time captured", { loadTimeMs: loadTime });
  log("INFO", "Security check", { isSecure, finalUrl: page.url() });

  return { loadTime, isSecure };
}
