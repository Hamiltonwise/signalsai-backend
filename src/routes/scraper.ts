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

/**
 * Auto-scroll through entire page to trigger lazy-loaded content and animations
 * This is critical for Elementor/WOW.js/AOS animations that trigger on scroll
 */
async function autoScrollPage(page: any): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let totalHeight = 0;
      const distance = 300; // Scroll 300px at a time
      const delay = 100; // 100ms between scrolls

      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          // Scroll back to top for the screenshot
          window.scrollTo(0, 0);
          resolve();
        }
      }, delay);
    });
  });
}

/**
 * Inject CSS to force visibility on common animation libraries
 * Targets Elementor, WOW.js, AOS, and similar animation frameworks
 */
async function forceAnimationVisibility(page: any): Promise<void> {
  await page.addStyleTag({
    content: `
      /* Force visibility for Elementor animations */
      .elementor-invisible,
      .elementor-widget.elementor-invisible {
        visibility: visible !important;
        opacity: 1 !important;
      }
      
      /* Force visibility for WOW.js */
      .wow {
        visibility: visible !important;
        opacity: 1 !important;
        animation: none !important;
      }
      
      /* Force visibility for AOS (Animate On Scroll) */
      [data-aos] {
        opacity: 1 !important;
        transform: none !important;
        visibility: visible !important;
      }
      
      /* Force visibility for GSAP ScrollTrigger */
      .gsap-hidden,
      [data-gsap] {
        opacity: 1 !important;
        visibility: visible !important;
      }
      
      /* Generic animation overrides */
      .animate__animated,
      .animated {
        animation-duration: 0s !important;
        opacity: 1 !important;
        visibility: visible !important;
      }
      
      /* Disable transitions temporarily */
      *, *::before, *::after {
        transition-duration: 0s !important;
        animation-duration: 0s !important;
      }
    `,
  });
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
 *   - desktop_screenshot: base64 data URI (JPEG, ~80% quality)
 *   - mobile_screenshot: base64 data URI (JPEG, ~80% quality)
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

      // ============ DESKTOP CAPTURE (1280x720 - reduced for file size) ============
      log("INFO", `Starting desktop capture`, { viewport: "1280x720" });

      await page.setViewport({
        width: 1280,
        height: 720,
        deviceScaleFactor: 1,
      });
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );

      log("DEBUG", `Navigating to URL`, { url });

      await page.goto(url, {
        waitUntil: "load",
        timeout: 30000,
      });

      log("DEBUG", `Page loaded, injecting animation visibility CSS`);

      // Inject CSS to force visibility of animated elements
      await forceAnimationVisibility(page);

      log("DEBUG", `Auto-scrolling to trigger lazy content and animations`);

      // Auto-scroll through page to trigger all animations
      await autoScrollPage(page);

      log("DEBUG", `Waiting 2 seconds for animations to settle`);

      // Wait for animations to complete after scrolling
      await new Promise((resolve) => setTimeout(resolve, 2000));

      log("DEBUG", `Taking desktop screenshot (full page, JPEG 80% quality)`);

      // Capture desktop screenshot (full page - JPEG for smaller file size)
      const desktopScreenshotBuffer = await page.screenshot({
        fullPage: true,
        encoding: "base64",
        type: "jpeg",
        quality: 80, // 80% quality - good balance of size and clarity
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

      // ============ MOBILE CAPTURE (375x667 - iPhone SE, reduced scale) ============
      log("INFO", `Starting mobile capture`, { viewport: "375x667" });

      await page.setViewport({
        width: 375,
        height: 667,
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 1, // Reduced from 2 to save file size
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

      log("DEBUG", `Mobile page loaded, injecting animation visibility CSS`);

      // Inject CSS again for mobile view
      await forceAnimationVisibility(page);

      log("DEBUG", `Auto-scrolling mobile view`);

      // Auto-scroll mobile view
      await autoScrollPage(page);

      log("DEBUG", `Waiting 2 seconds for mobile animations to settle`);

      // Wait for animations to complete
      await new Promise((resolve) => setTimeout(resolve, 2000));

      log("DEBUG", `Taking mobile screenshot (full page, JPEG 80% quality)`);

      // Capture mobile screenshot (full page - JPEG for smaller file size)
      const mobileScreenshotBuffer = await page.screenshot({
        fullPage: true,
        encoding: "base64",
        type: "jpeg",
        quality: 80,
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
        desktop_screenshot: `data:image/jpeg;base64,${desktopScreenshotBuffer}`,
        mobile_screenshot: `data:image/jpeg;base64,${mobileScreenshotBuffer}`,
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
