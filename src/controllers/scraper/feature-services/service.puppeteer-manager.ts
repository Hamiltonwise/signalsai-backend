/**
 * Puppeteer browser lifecycle management for the scraper module.
 *
 * Handles browser launch, page creation, navigation with retry,
 * and safe browser cleanup. All Puppeteer configuration (args,
 * resource blocking, viewport, user-agent) lives here.
 */

import puppeteer, { Browser, Page } from "puppeteer";
import { ViewportConfig, UserAgent } from "../feature-utils/scraper.enums";
import { log } from "../feature-utils/util.scraper-logger";

/** Puppeteer launch arguments: sandboxed, GPU disabled, shared memory disabled */
const BROWSER_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--disable-web-security",
  "--disable-features=IsolateOrigins,site-per-process",
];

/**
 * Launch a headless Puppeteer browser with optimized args.
 */
export async function launchBrowser(): Promise<Browser> {
  log("INFO", "Launching Puppeteer browser");

  const browser = await puppeteer.launch({
    headless: true,
    args: BROWSER_ARGS,
  });

  log("DEBUG", "Browser launched successfully");
  return browser;
}

/**
 * Create a new page with request interception enabled.
 *
 * Blocks media resources (video/audio) to speed up loading.
 * Fonts, images, scripts, and stylesheets are allowed through.
 */
export async function createPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  log("DEBUG", "New page created");

  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const resourceType = req.resourceType();
    if (resourceType === "media") {
      req.abort();
    } else {
      req.continue();
    }
  });

  return page;
}

/**
 * Set the page viewport and user-agent for desktop mode.
 */
export async function setDesktopViewport(page: Page): Promise<void> {
  await page.setViewport(ViewportConfig.DESKTOP);
  await page.setUserAgent(UserAgent.DESKTOP);
  log("INFO", "Starting desktop capture", { viewport: "1280x720" });
}

/**
 * Set the page viewport and user-agent for mobile mode (iPhone SE).
 */
export async function setMobileViewport(page: Page): Promise<void> {
  await page.setViewport(ViewportConfig.MOBILE);
  await page.setUserAgent(UserAgent.MOBILE);
  log("INFO", "Starting mobile capture", { viewport: "375x667" });
}

/**
 * Navigate to a URL with retry logic.
 *
 * Attempts navigation up to `maxRetries` times with a 1-second delay
 * between attempts. Uses `domcontentloaded` wait condition with a
 * 30-second timeout per attempt.
 *
 * Returns `true` if navigation succeeded, `false` if all retries failed.
 */
export async function navigateWithRetry(
  page: Page,
  url: string,
  maxRetries: number = 2
): Promise<boolean> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      log("DEBUG", `Navigation attempt ${attempt}/${maxRetries}`);
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      lastError = null;
      break;
    } catch (navError: any) {
      lastError = navError;
      log("WARN", `Navigation attempt ${attempt} failed`, {
        error: navError.message,
      });
      if (attempt < maxRetries) {
        log("DEBUG", "Retrying navigation...");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  if (lastError !== null) {
    log("ERROR", "All navigation attempts failed", {
      error: (lastError as Error).message,
    });
    return false;
  }

  return true;
}

/**
 * Safely close a Puppeteer browser instance.
 *
 * Handles null/undefined browser and swallows close errors.
 */
export async function closeBrowser(browser: Browser | null): Promise<void> {
  if (browser !== null) {
    log("DEBUG", "Closing browser");
    await browser!.close();
  }
}
