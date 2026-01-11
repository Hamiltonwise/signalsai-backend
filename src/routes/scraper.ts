import { Router, Request, Response, NextFunction } from "express";
import puppeteer, { Browser } from "puppeteer";
import fs from "fs";
import path from "path";

const router = Router();

// ============ FILE LOGGING SETUP ============
const LOG_DIR = path.join(__dirname, "../logs");
const LOG_FILE = path.join(LOG_DIR, "scraping-tool.log");

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Formats a timestamp for log entries
 */
function formatTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Logs a message to both console and the scraping-tool.log file
 */
function log(
  level: "INFO" | "ERROR" | "DEBUG" | "WARN",
  message: string,
  data?: Record<string, any>
): void {
  const timestamp = formatTimestamp();
  const dataStr = data ? ` | ${JSON.stringify(data)}` : "";
  const logMessage = `[${timestamp}] [SCRAPER] [${level}] ${message}${dataStr}\n`;

  try {
    fs.appendFileSync(LOG_FILE, logMessage);
    console.log(`[SCRAPER] [${level}] ${message}`, data || "");
  } catch (error) {
    console.error(`[SCRAPER] Failed to write to log file:`, error);
    console.log(`[SCRAPER] [${level}] ${message}`, data || "");
  }
}

/**
 * Logs the start of a scraping operation
 */
function logOperationStart(domain: string, url: string): void {
  log("INFO", `Starting scrape operation`, { domain, url });
  log("INFO", `========================================`);
}

/**
 * Logs the completion of a scraping operation
 */
function logOperationComplete(
  domain: string,
  durationMs: number,
  success: boolean
): void {
  log("INFO", `========================================`);
  log("INFO", `Scrape operation ${success ? "COMPLETED" : "FAILED"}`, {
    domain,
    durationMs,
    success,
  });
}

// Simple API key middleware for n8n
const validateScraperKey = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const apiKey = req.headers["x-scraper-key"];
  const validKey = process.env.SCRAPER_API_KEY;

  if (!validKey) {
    return res.status(500).json({
      success: false,
      error: "Scraper API key not configured on server",
    });
  }

  if (apiKey !== validKey) {
    return res.status(401).json({
      success: false,
      error: "Invalid or missing API key",
    });
  }

  next();
};

// Normalize domain to full URL (treat bare domains as HTTPS)
const normalizeUrl = (domain: string): string => {
  let url = domain.trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }
  return url;
};

interface HomepageRequest {
  domain: string;
}

interface HomepageResponse {
  success: boolean;
  desktop_screenshot?: string;
  mobile_screenshot?: string;
  homepage_markup?: string;
  error?: string;
}

/**
 * POST /scraper/homepage
 *
 * Captures screenshots (desktop + mobile) and HTML markup of a website's homepage.
 *
 * Headers:
 *   - x-scraper-key: API key for authentication
 *
 * Body:
 *   - domain: string (e.g., "example.com" or "https://example.com")
 *
 * Response:
 *   - success: boolean
 *   - desktop_screenshot: base64 data URI (PNG)
 *   - mobile_screenshot: base64 data URI (PNG)
 *   - homepage_markup: raw HTML string
 */
router.post(
  "/homepage",
  validateScraperKey,
  async (req: Request, res: Response) => {
    const { domain } = req.body as HomepageRequest;

    if (!domain || typeof domain !== "string") {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid 'domain' field",
      } as HomepageResponse);
    }

    const url = normalizeUrl(domain);
    let browser: Browser | null = null;
    const startTime = Date.now();

    // Log operation start
    logOperationStart(domain, url);

    try {
      log("INFO", `Launching Puppeteer browser`);

      browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-web-security",
          "--disable-features=IsolateOrigins,site-per-process",
        ],
      });

      log("DEBUG", `Browser launched successfully`);

      const page = await browser.newPage();
      log("DEBUG", `New page created`);

      // Block unnecessary resources to speed up loading
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        const resourceType = req.resourceType();
        // Block heavy resources that aren't essential for screenshots
        if (["media", "font"].includes(resourceType)) {
          req.abort();
        } else {
          req.continue();
        }
      });

      // ============ DESKTOP CAPTURE (1920x1080) ============
      log("INFO", `Starting desktop capture`, { viewport: "1920x1080" });

      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );

      log("DEBUG", `Navigating to URL`, { url });

      await page.goto(url, {
        waitUntil: "load",
        timeout: 30000,
      });

      log("DEBUG", `Page loaded, waiting 5 seconds for dynamic content`);

      // Wait 5 seconds after page load for dynamic content
      await new Promise((resolve) => setTimeout(resolve, 5000));

      log("DEBUG", `Taking desktop screenshot (full page)`);

      // Capture desktop screenshot (full page - top to bottom)
      const desktopScreenshotBuffer = await page.screenshot({
        fullPage: true,
        encoding: "base64",
        type: "png",
      });

      const desktopScreenshotSize = Math.round(
        (desktopScreenshotBuffer as string).length / 1024
      );
      log("INFO", `Desktop screenshot captured`, {
        sizeKB: desktopScreenshotSize,
      });

      // Get page HTML markup
      const homepageMarkup = await page.content();
      const markupSize = Math.round(homepageMarkup.length / 1024);
      log("INFO", `Homepage markup captured`, { sizeKB: markupSize });

      // ============ MOBILE CAPTURE (390x844 - iPhone 14 Pro) ============
      log("INFO", `Starting mobile capture`, { viewport: "390x844" });

      await page.setViewport({
        width: 390,
        height: 844,
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      });
      await page.setUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
      );

      log("DEBUG", `Reloading page for mobile view`);

      // Reload for mobile version (some sites serve different content)
      await page.goto(url, {
        waitUntil: "load",
        timeout: 30000,
      });

      log("DEBUG", `Mobile page loaded, waiting 5 seconds for dynamic content`);

      // Wait 5 seconds after page load
      await new Promise((resolve) => setTimeout(resolve, 5000));

      log("DEBUG", `Taking mobile screenshot (full page)`);

      // Capture mobile screenshot (full page - top to bottom)
      const mobileScreenshotBuffer = await page.screenshot({
        fullPage: true,
        encoding: "base64",
        type: "png",
      });

      const mobileScreenshotSize = Math.round(
        (mobileScreenshotBuffer as string).length / 1024
      );
      log("INFO", `Mobile screenshot captured`, {
        sizeKB: mobileScreenshotSize,
      });

      await browser.close();
      browser = null;

      const durationMs = Date.now() - startTime;
      logOperationComplete(domain, durationMs, true);

      log("INFO", `Returning response`, {
        desktopSizeKB: desktopScreenshotSize,
        mobileSizeKB: mobileScreenshotSize,
        markupSizeKB: markupSize,
        totalDurationMs: durationMs,
      });

      return res.json({
        success: true,
        desktop_screenshot: `data:image/png;base64,${desktopScreenshotBuffer}`,
        mobile_screenshot: `data:image/png;base64,${mobileScreenshotBuffer}`,
        homepage_markup: homepageMarkup,
      } as HomepageResponse);
    } catch (error: any) {
      const durationMs = Date.now() - startTime;

      log("ERROR", `Scrape operation failed`, {
        url,
        error: error.message,
        stack: error.stack,
        durationMs,
      });

      logOperationComplete(domain, durationMs, false);

      if (browser) {
        log("DEBUG", `Closing browser after error`);
        await browser.close();
      }

      return res.status(500).json({
        success: false,
        error: error.message || "Failed to capture screenshot",
      } as HomepageResponse);
    }
  }
);

export default router;
