/**
 * Scraping orchestrator for the scraper module.
 *
 * Coordinates the full homepage scraping flow:
 * normalize URL -> launch browser -> navigate -> desktop screenshot ->
 * metrics -> broken links (background) -> NAP extraction -> mobile screenshot ->
 * close browser -> aggregate results.
 *
 * This is pure orchestration — no direct Puppeteer calls, no HTTP concerns.
 * Each step delegates to the appropriate service or utility.
 */

import { Browser } from "puppeteer";
import { ScrapingResult } from "../feature-utils/scraper.types";
import { normalizeUrl } from "../feature-utils/util.url-normalizer";
import { log } from "../feature-utils/util.scraper-logger";
import {
  launchBrowser,
  createPage,
  navigateWithRetry,
  closeBrowser,
} from "./service.puppeteer-manager";
import { captureDesktop, captureMobile } from "./service.screenshot-capture";
import { collectMetrics } from "./service.performance-metrics";
import { findBrokenLinks } from "./service.link-checker";
import { extractNAPDetails } from "./service.nap-extractor";

/**
 * Scrape a homepage and return aggregated results.
 *
 * Flow:
 *   1. Normalize the domain to a full URL
 *   2. Launch Puppeteer browser
 *   3. Create page with request interception
 *   4. Navigate with retry (max 2 attempts)
 *   5. Capture desktop screenshot (1280x720)
 *   6. Extract page HTML markup
 *   7. Collect performance metrics (load time, HTTPS)
 *   8. Start broken links check in background (max 3)
 *   9. Extract NAP details (business name, phone, address, email)
 *   10. Capture mobile screenshot (375x667)
 *   11. Await broken links results
 *   12. Close browser
 *   13. Return aggregated ScrapingResult
 *
 * If navigation fails after all retries, returns `null` to signal the
 * controller to return the standard error response.
 *
 * Always closes the browser, even on error (via finally block).
 *
 * @throws Re-throws unexpected errors after closing the browser.
 */
export async function scrapeHomepage(
  domain: string
): Promise<ScrapingResult | null> {
  const url = normalizeUrl(domain);
  let browser: Browser | null = null;

  try {
    browser = await launchBrowser();
    const page = await createPage(browser);

    // Navigate with retry
    log("DEBUG", "Navigating to URL", { url });
    const navigationSucceeded = await navigateWithRetry(page, url);

    if (!navigationSucceeded) {
      await closeBrowser(browser);
      browser = null;
      return null;
    }

    // Desktop screenshot
    const desktopScreenshot = await captureDesktop(page);

    // Extract HTML markup
    const homepageMarkup = await page.content();
    const markupSize = Math.round(homepageMarkup.length / 1024);
    log("INFO", "Homepage markup captured", { sizeKB: markupSize });

    // Performance metrics (load time, HTTPS)
    const metrics = await collectMetrics(page);

    // Start broken links check in background
    log("INFO", "Starting broken links check (max 3) in background");
    const brokenLinksPromise = findBrokenLinks(page, page.url(), 3);

    // NAP extraction
    log("INFO", "Extracting NAP (Name, Address, Phone) details");
    const napDetails = await extractNAPDetails(page);

    // Mobile screenshot
    const mobileScreenshot = await captureMobile(page);

    // Close browser before awaiting broken links
    await closeBrowser(browser);
    browser = null;

    // Await broken links result
    log("DEBUG", "Waiting for broken links check to complete");
    const brokenLinks = await brokenLinksPromise;
    log("INFO", "Broken links check completed", {
      brokenCount: brokenLinks.length,
    });

    return {
      desktopScreenshot,
      mobileScreenshot,
      homepageMarkup,
      metrics,
      brokenLinks,
      napDetails,
    };
  } catch (error: any) {
    // Always close browser on error
    if (browser) {
      log("DEBUG", "Closing browser after error");
      await closeBrowser(browser);
    }
    throw error;
  }
}
