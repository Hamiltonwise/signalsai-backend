import { Router, Request, Response, NextFunction } from "express";
import puppeteer, { Browser, Page } from "puppeteer";
import fs from "fs";
import path from "path";
import https from "https";
import http from "http";

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
      const distance = 400; // Scroll 400px at a time (optimized)
      const delay = 80; // 80ms between scrolls (optimized)

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

/**
 * Extract all unique links from the page
 */
async function extractPageLinks(page: Page): Promise<string[]> {
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

  return [...new Set(links)]; // Remove duplicates
}

/**
 * Check if a URL is broken (returns 4xx/5xx or times out)
 */
async function checkLinkStatus(
  linkUrl: string,
  baseUrl: string
): Promise<{ url: string; status: number | string } | null> {
  return new Promise((resolve) => {
    try {
      // Resolve relative URLs
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
          // Consider 4xx and 5xx as broken
          if (status >= 400) {
            resolve({ url: fullUrl, status });
          } else {
            resolve(null); // Link is OK
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
 * Check multiple links and return broken ones (max 10)
 */
async function findBrokenLinks(
  page: Page,
  baseUrl: string,
  maxBrokenLinks: number = 10
): Promise<Array<{ url: string; status: number | string }>> {
  const links = await extractPageLinks(page);
  const brokenLinks: Array<{ url: string; status: number | string }> = [];

  log("DEBUG", `Checking ${links.length} links for broken URLs`);

  // Check links in batches of 5 to avoid overwhelming the server
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

/**
 * Get page load time using Performance API
 */
async function getPageLoadTime(page: Page): Promise<number> {
  const timing = await page.evaluate(() => {
    const perf = performance.timing;
    return {
      navigationStart: perf.navigationStart,
      loadEventEnd: perf.loadEventEnd,
    };
  });

  // If loadEventEnd hasn't fired yet, use current time
  if (timing.loadEventEnd === 0) {
    return Date.now() - timing.navigationStart;
  }

  return timing.loadEventEnd - timing.navigationStart;
}

/**
 * NAP (Name, Address, Phone) Detection
 * Extracts business contact information from the page
 */
interface NAPDetails {
  businessName: string | null;
  addresses: string[];
  phoneNumbers: string[];
  emails: string[];
}

/**
 * Extract NAP (Name, Address, Phone) details from the page
 */
async function extractNAPDetails(page: Page): Promise<NAPDetails> {
  const napData = await page.evaluate(() => {
    const result: NAPDetails = {
      businessName: null,
      addresses: [],
      phoneNumbers: [],
      emails: [],
    };

    // ============ BUSINESS NAME DETECTION ============
    // Priority: Schema.org > OG title > h1 > title tag

    // Try Schema.org LocalBusiness or Organization
    const schemaScripts = document.querySelectorAll(
      'script[type="application/ld+json"]'
    );
    schemaScripts.forEach((script) => {
      try {
        const data = JSON.parse(script.textContent || "");
        // Handle both single object and array of objects
        const schemas = Array.isArray(data) ? data : [data];
        for (const schema of schemas) {
          if (
            schema["@type"] &&
            (schema["@type"].includes("LocalBusiness") ||
              schema["@type"].includes("Organization") ||
              schema["@type"] === "LocalBusiness" ||
              schema["@type"] === "Organization" ||
              schema["@type"] === "MedicalBusiness" ||
              schema["@type"] === "Dentist" ||
              schema["@type"] === "Physician")
          ) {
            if (schema.name && !result.businessName) {
              result.businessName = schema.name;
            }
            // Also extract address and phone from schema if available
            if (schema.address) {
              const addr = schema.address;
              if (typeof addr === "string") {
                result.addresses.push(addr);
              } else if (addr.streetAddress) {
                const parts = [
                  addr.streetAddress,
                  addr.addressLocality,
                  addr.addressRegion,
                  addr.postalCode,
                  addr.addressCountry,
                ].filter(Boolean);
                result.addresses.push(parts.join(", "));
              }
            }
            if (schema.telephone) {
              result.phoneNumbers.push(schema.telephone);
            }
            if (schema.email) {
              result.emails.push(schema.email);
            }
          }
        }
      } catch (e) {
        // Invalid JSON, skip
      }
    });

    // Fallback to OG site_name or title
    if (!result.businessName) {
      const ogSiteName = document.querySelector(
        'meta[property="og:site_name"]'
      );
      if (ogSiteName) {
        result.businessName = ogSiteName.getAttribute("content");
      }
    }

    // Fallback to first h1
    if (!result.businessName) {
      const h1 = document.querySelector("h1");
      if (h1 && h1.textContent) {
        const text = h1.textContent.trim();
        // Only use if it's reasonably short (likely a business name)
        if (text.length < 100) {
          result.businessName = text;
        }
      }
    }

    // Final fallback to title tag (cleaned)
    if (!result.businessName) {
      const title = document.title;
      if (title) {
        // Remove common suffixes like "| Home", "- Welcome", etc.
        result.businessName = title.split(/[|\-–—]/)[0].trim();
      }
    }

    // ============ PHONE NUMBER DETECTION ============
    const bodyText = document.body.innerText || "";
    const htmlContent = document.body.innerHTML || "";

    // Phone regex patterns (US formats primarily, but also international)
    const phonePatterns = [
      // US formats: (123) 456-7890, 123-456-7890, 123.456.7890, 1234567890
      /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
      // International with + prefix
      /\+\d{1,3}[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g,
    ];

    const phoneSet = new Set<string>(result.phoneNumbers);
    phonePatterns.forEach((pattern) => {
      const matches = bodyText.match(pattern);
      if (matches) {
        matches.forEach((phone) => {
          // Clean and normalize the phone number
          const cleaned = phone.replace(/[^\d+]/g, "");
          if (cleaned.length >= 10 && cleaned.length <= 15) {
            phoneSet.add(phone.trim());
          }
        });
      }
    });

    // Also check tel: links
    const telLinks = document.querySelectorAll('a[href^="tel:"]');
    telLinks.forEach((link) => {
      const href = link.getAttribute("href");
      if (href) {
        const phone = href.replace("tel:", "").trim();
        if (phone.length >= 10) {
          phoneSet.add(phone);
        }
      }
    });

    result.phoneNumbers = [...phoneSet].slice(0, 5); // Max 5 phone numbers

    // ============ ADDRESS DETECTION ============
    // Look for common address patterns
    const addressPatterns = [
      // US street address: 123 Main Street, City, ST 12345
      /\d{1,5}\s+[\w\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl|Circle|Cir|Highway|Hwy)\.?(?:\s*,?\s*(?:Suite|Ste|Apt|Unit|#)\s*[\w\d-]+)?(?:\s*,?\s*[\w\s]+)?(?:\s*,?\s*[A-Z]{2})?\s*\d{5}(?:-\d{4})?/gi,
    ];

    const addressSet = new Set<string>(result.addresses);

    // Check for address in common containers
    const addressSelectors = [
      '[class*="address"]',
      '[class*="location"]',
      '[class*="contact"]',
      '[itemtype*="PostalAddress"]',
      "address",
      "[data-address]",
    ];

    addressSelectors.forEach((selector) => {
      const elements = document.querySelectorAll(selector);
      elements.forEach((el) => {
        const text = el.textContent?.trim();
        if (text && text.length > 10 && text.length < 200) {
          // Check if it looks like an address (contains numbers and common address words)
          if (
            /\d/.test(text) &&
            /street|st\.|avenue|ave\.|road|rd\.|blvd|drive|dr\.|suite|ste|city|state|\d{5}/i.test(
              text
            )
          ) {
            addressSet.add(text.replace(/\s+/g, " ").trim());
          }
        }
      });
    });

    // Also try to find addresses in body text using patterns
    addressPatterns.forEach((pattern) => {
      const matches = bodyText.match(pattern);
      if (matches) {
        matches.forEach((addr) => {
          addressSet.add(addr.replace(/\s+/g, " ").trim());
        });
      }
    });

    result.addresses = [...addressSet].slice(0, 3); // Max 3 addresses

    // ============ EMAIL DETECTION ============
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emailSet = new Set<string>(result.emails);

    // Check mailto: links first (most reliable)
    const mailtoLinks = document.querySelectorAll('a[href^="mailto:"]');
    mailtoLinks.forEach((link) => {
      const href = link.getAttribute("href");
      if (href) {
        const email = href.replace("mailto:", "").split("?")[0].trim();
        if (email.includes("@")) {
          emailSet.add(email.toLowerCase());
        }
      }
    });

    // Then check body text
    const emailMatches = bodyText.match(emailPattern);
    if (emailMatches) {
      emailMatches.forEach((email) => {
        // Filter out common false positives
        if (
          !email.includes("example.com") &&
          !email.includes("yourdomain") &&
          !email.endsWith(".png") &&
          !email.endsWith(".jpg")
        ) {
          emailSet.add(email.toLowerCase());
        }
      });
    }

    result.emails = [...emailSet].slice(0, 3); // Max 3 emails

    return result;
  });

  return napData;
}

interface BrokenLink {
  url: string;
  status: number | string;
}

interface HomepageResponse {
  success: boolean;
  desktop_screenshot?: string;
  mobile_screenshot?: string;
  homepage_markup?: string;
  isSecure?: boolean;
  loadTime?: number;
  brokenLinks?: BrokenLink[];
  napDetails?: NAPDetails;
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
 *   - isSecure: boolean (true if site uses HTTPS)
 *   - loadTime: number (page load time in milliseconds, excludes artificial delays)
 *   - brokenLinks: array of broken links (max 10)
 *   - napDetails: NAP (Name, Address, Phone) details detected on the page
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

      // Block unnecessary resources to speed up loading (but allow fonts for icons/text)
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        const resourceType = req.resourceType();
        // Only block media (video/audio) - fonts are needed for icons and text rendering
        if (resourceType === "media") {
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

      // Retry logic: attempt navigation up to 2 times
      const maxRetries = 2;
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          log("DEBUG", `Navigation attempt ${attempt}/${maxRetries}`);
          await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 30000,
          });
          lastError = null;
          break; // Success, exit retry loop
        } catch (navError: any) {
          lastError = navError;
          log("WARN", `Navigation attempt ${attempt} failed`, {
            error: navError.message
          });
          if (attempt < maxRetries) {
            log("DEBUG", `Retrying navigation...`);
            await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1s before retry
          }
        }
      }

      // If all retries failed, return error response
      if (lastError !== null) {
        log("ERROR", `All navigation attempts failed`, {
          error: (lastError as Error).message
        });
        if (browser !== null) {
          await browser!.close();
        }
        return res.json({
          error: true,
          error_message: "cannot load page",
        });
      }

      // Capture page load time immediately after load (before our artificial delays)
      const loadTime = await getPageLoadTime(page);
      log("INFO", `Page load time captured`, { loadTimeMs: loadTime });

      // Check if the final URL is secure (HTTPS)
      const finalUrl = page.url();
      const isSecure = finalUrl.startsWith("https://");
      log("INFO", `Security check`, { isSecure, finalUrl });

      log("DEBUG", `Page loaded, injecting animation visibility CSS`);

      // Inject CSS to force visibility of animated elements
      await forceAnimationVisibility(page);

      log("DEBUG", `Auto-scrolling to trigger lazy content and animations`);

      // Auto-scroll through page to trigger all animations
      await autoScrollPage(page);

      log("DEBUG", `Waiting 1 second for animations to settle`);

      // Wait for animations to complete after scrolling (reduced from 2s for performance)
      await new Promise((resolve) => setTimeout(resolve, 1000));

      log("DEBUG", `Taking desktop screenshot (full page, JPEG 70% quality)`);

      // Capture desktop screenshot (full page - JPEG for smaller file size)
      const desktopScreenshotBuffer = await page.screenshot({
        fullPage: true,
        encoding: "base64",
        type: "jpeg",
        quality: 70, // 70% quality - optimized for speed while maintaining clarity
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

      // ============ BROKEN LINKS CHECK ============
      // Start broken links check in background (don't wait for it)
      log("INFO", `Starting broken links check (max 3) in background`);
      const brokenLinksPromise = findBrokenLinks(page, finalUrl, 3);

      // ============ NAP DETAILS EXTRACTION ============
      log("INFO", `Extracting NAP (Name, Address, Phone) details`);
      const napDetails = await extractNAPDetails(page);
      log("INFO", `NAP extraction completed`, {
        hasBusinessName: !!napDetails.businessName,
        addressCount: napDetails.addresses.length,
        phoneCount: napDetails.phoneNumbers.length,
        emailCount: napDetails.emails.length,
      });

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

      log("DEBUG", `Mobile page viewport set, injecting animation visibility CSS (no reload - viewport change triggers re-render)`);

      // Inject CSS again for mobile view
      await forceAnimationVisibility(page);

      log("DEBUG", `Auto-scrolling mobile view`);

      // Auto-scroll mobile view
      await autoScrollPage(page);

      log("DEBUG", `Waiting 1 second for mobile animations to settle`);

      // Wait for animations to complete (reduced from 2s for performance)
      await new Promise((resolve) => setTimeout(resolve, 1000));

      log("DEBUG", `Taking mobile screenshot (full page, JPEG 70% quality)`);

      // Capture mobile screenshot (full page - JPEG for smaller file size)
      const mobileScreenshotBuffer = await page.screenshot({
        fullPage: true,
        encoding: "base64",
        type: "jpeg",
        quality: 70,
      });

      const mobileScreenshotSize = Math.round(
        (mobileScreenshotBuffer as string).length / 1024
      );
      log("INFO", `Mobile screenshot captured`, {
        sizeKB: mobileScreenshotSize,
      });

      if (browser !== null) {
        await browser!.close();
      }
      browser = null;

      // Wait for broken links check to complete before returning response
      log("DEBUG", `Waiting for broken links check to complete`);
      const brokenLinks = await brokenLinksPromise;
      log("INFO", `Broken links check completed`, {
        brokenCount: brokenLinks.length,
      });

      const durationMs = Date.now() - startTime;
      logOperationComplete(domain, durationMs, true);

      log("INFO", `Returning response`, {
        desktopSizeKB: desktopScreenshotSize,
        mobileSizeKB: mobileScreenshotSize,
        markupSizeKB: markupSize,
        totalDurationMs: durationMs,
        brokenLinksCount: brokenLinks.length,
      });

      return res.json({
        success: true,
        desktop_screenshot: `data:image/jpeg;base64,${desktopScreenshotBuffer}`,
        mobile_screenshot: `data:image/jpeg;base64,${mobileScreenshotBuffer}`,
        homepage_markup: homepageMarkup,
        isSecure,
        loadTime,
        brokenLinks,
        napDetails,
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

      return res.json({
        error: true,
        error_message: "cannot load page",
      });
    }
  }
);

export default router;
