/**
 * Scraper controller — HTTP layer for the homepage scraping endpoint.
 *
 * Responsibilities:
 * - Request parameter extraction and validation
 * - Delegates all scraping work to the orchestrator
 * - Maps orchestrator results to the HTTP response format
 * - Error handling and logging
 * - Duration tracking
 *
 * This file should contain NO Puppeteer logic, no link checking,
 * no NAP extraction, no screenshot capture — only HTTP concerns.
 */

import { Request, Response } from "express";
import { HomepageRequest, HomepageResponse } from "./feature-utils/scraper.types";
import { scrapeHomepage } from "./feature-services/service.scraping-orchestrator";
import {
  log,
  logOperationStart,
  logOperationComplete,
} from "./feature-utils/util.scraper-logger";
import { normalizeUrl } from "./feature-utils/util.url-normalizer";

/**
 * POST /scraper/homepage
 *
 * Captures desktop and mobile screenshots, HTML markup, performance metrics,
 * broken links, and NAP details for a given domain.
 *
 * Request body: { domain: string }
 * Authentication: x-scraper-key header (handled by scraperAuth middleware)
 *
 * Success response:
 *   { success: true, desktop_screenshot, mobile_screenshot, homepage_markup,
 *     isSecure, loadTime, brokenLinks, napDetails }
 *
 * Error responses:
 *   - 400: Missing or invalid domain
 *   - { error: true, error_message: "cannot load page" } on navigation/scraping failures
 */
export async function captureHomepage(
  req: Request,
  res: Response
): Promise<void> {
  const { domain } = req.body as HomepageRequest;

  if (!domain || typeof domain !== "string") {
    res.status(400).json({
      success: false,
      error: "Missing or invalid 'domain' field",
    } as HomepageResponse);
    return;
  }

  const url = normalizeUrl(domain);
  const startTime = Date.now();

  logOperationStart(domain, url);

  try {
    const result = await scrapeHomepage(domain);

    // Orchestrator returns null when navigation fails after all retries
    if (result === null) {
      const durationMs = Date.now() - startTime;
      logOperationComplete(domain, durationMs, false);

      res.json({
        error: true,
        error_message: "cannot load page",
      });
      return;
    }

    const durationMs = Date.now() - startTime;
    logOperationComplete(domain, durationMs, true);

    log("INFO", "Returning response", {
      desktopSizeKB: result.desktopScreenshot.sizeKB,
      mobileSizeKB: result.mobileScreenshot.sizeKB,
      markupSizeKB: Math.round(result.homepageMarkup.length / 1024),
      totalDurationMs: durationMs,
      brokenLinksCount: result.brokenLinks.length,
    });

    res.json({
      success: true,
      desktop_screenshot: `data:image/jpeg;base64,${result.desktopScreenshot.base64}`,
      mobile_screenshot: `data:image/jpeg;base64,${result.mobileScreenshot.base64}`,
      homepage_markup: result.homepageMarkup,
      isSecure: result.metrics.isSecure,
      loadTime: result.metrics.loadTime,
      brokenLinks: result.brokenLinks,
      napDetails: result.napDetails,
    } as HomepageResponse);
  } catch (error: any) {
    const durationMs = Date.now() - startTime;

    log("ERROR", "Scrape operation failed", {
      url,
      error: error.message,
      stack: error.stack,
      durationMs,
    });

    logOperationComplete(domain, durationMs, false);

    res.json({
      error: true,
      error_message: "cannot load page",
    });
  }
}
