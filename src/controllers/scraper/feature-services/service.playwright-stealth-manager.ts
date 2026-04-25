/**
 * Playwright + stealth scraper — fallback path for bot-protected targets.
 *
 * When the default Puppeteer scraper hits Cloudflare's `ERR_BLOCKED_BY_CLIENT`
 * (the most common bot-block signature on EC2), we retry with this manager.
 * Playwright + `puppeteer-extra-plugin-stealth` patches the obvious headless
 * tells (navigator.webdriver, plugin metadata, codecs, WebGL fingerprint, etc.)
 * which beats CF's first-line bot detection on a meaningful fraction of sites.
 *
 * Design choice: this is ONE self-contained function returning a full
 * ScrapingResult, NOT a parallel set of granular helpers (launchBrowser,
 * createPage, etc.) like service.puppeteer-manager.ts. Reason: the existing
 * helper services (screenshot-capture, performance-metrics, link-checker)
 * are typed against Puppeteer's Page; reusing them with Playwright's Page
 * would require either rewriting them or wrapping types. Keeping the
 * stealth path self-contained avoids that fan-out.
 *
 * Signal contract for the orchestrator:
 *   { result: ScrapingResult | null, blocked: boolean }
 *   - result non-null → success, use this exactly like the default path
 *   - blocked=true → CF or similar bot protection detected; both methods
 *     should be considered exhausted, processor should set website_blocked
 *   - blocked=false + result null → non-block failure (timeout, DNS, etc);
 *     processor falls through to no-website but does NOT set website_blocked
 *
 * Pattern reference: service.puppeteer-manager.ts (analog at the manager
 * level) and service.scraping-orchestrator.ts (analog at the orchestration
 * level — this file collapses both into one function for the stealth path).
 */

import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser } from "playwright";
import { ScrapingResult } from "../feature-utils/scraper.types";
import { normalizeUrl } from "../feature-utils/util.url-normalizer";
import { log } from "../feature-utils/util.scraper-logger";

// Register stealth plugin once at module load. playwright-extra patches the
// chromium object in-place; this is a no-op on subsequent imports.
chromium.use(StealthPlugin());

const STEALTH_VIEWPORT = { width: 1280, height: 720 };
const STEALTH_NAV_TIMEOUT_MS = 30_000;

// Realistic desktop UA matching a current Chrome on macOS. Stealth plugin
// also patches navigator.userAgent runtime properties, but setting it here
// gives us a coherent baseline at the HTTP-header layer.
const STEALTH_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const STEALTH_BROWSER_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
];

// Title strings that indicate a Cloudflare/bot challenge page rather than
// the real site content. Page navigation can "succeed" (HTTP 200) while
// landing on one of these — so we check the title before trusting the data.
const CHALLENGE_TITLE_REGEX =
  /just a moment|attention required|cloudflare|access denied|please wait/i;

// Error messages that indicate an unrecoverable bot block (vs a transient
// network failure). When we see one of these, we report `blocked: true` so
// the processor can mark the audit `website_blocked` and skip the website
// branch of the GBP analysis.
const BLOCKED_ERROR_REGEX =
  /ERR_BLOCKED_BY_CLIENT|ERR_HTTP2_PROTOCOL_ERROR|ERR_TOO_MANY_REDIRECTS/i;

export async function scrapeHomepageStealth(
  domain: string
): Promise<{ result: ScrapingResult | null; blocked: boolean }> {
  const url = normalizeUrl(domain);
  let browser: Browser | null = null;

  try {
    log("INFO", "[STEALTH] Launching Playwright + stealth browser");
    browser = await chromium.launch({
      headless: true,
      args: STEALTH_BROWSER_ARGS,
    });

    const context = await browser.newContext({
      viewport: STEALTH_VIEWPORT,
      userAgent: STEALTH_USER_AGENT,
    });

    const page = await context.newPage();

    log("DEBUG", "[STEALTH] Navigating to URL", { url });
    const navStart = Date.now();

    try {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: STEALTH_NAV_TIMEOUT_MS,
      });
    } catch (err: any) {
      const msg = err?.message || String(err);
      const isBlocked = BLOCKED_ERROR_REGEX.test(msg);
      log("WARN", "[STEALTH] Navigation failed", {
        error: msg,
        blocked: isBlocked,
      });
      return { result: null, blocked: isBlocked };
    }

    const loadTime = Date.now() - navStart;
    const finalUrl = page.url();
    const isSecure = finalUrl.startsWith("https://");

    // Detect Cloudflare challenge page even if navigation reported success.
    const titleText = (await page.title()) || "";
    if (CHALLENGE_TITLE_REGEX.test(titleText)) {
      log("WARN", "[STEALTH] Got challenge page (title match)", {
        title: titleText,
      });
      return { result: null, blocked: true };
    }

    // Capture rendered HTML
    const homepageMarkup = await page.content();
    const markupKB = Math.round(homepageMarkup.length / 1024);
    log("INFO", "[STEALTH] Homepage markup captured", { sizeKB: markupKB });

    // Capture desktop screenshot (full page, JPEG 70% — matches default path)
    const screenshotBuffer = await page.screenshot({
      type: "jpeg",
      quality: 70,
      fullPage: true,
    });
    const sizeKB = Math.round(screenshotBuffer.length / 1024);
    const screenshotBase64 = screenshotBuffer.toString("base64");
    log("INFO", "[STEALTH] Desktop screenshot captured", { sizeKB });

    // Mobile screenshot, broken-link check, and NAP extraction are all
    // intentionally omitted on the stealth path. Branch B (Claude website
    // analysis) doesn't consume mobile/NAP at all, and brokenLinks is just
    // a count for telemetry — not worth the extra wall-clock on a fallback
    // path that's already paying ~10s for the failed default attempt.
    return {
      result: {
        desktopScreenshot: { base64: screenshotBase64, sizeKB },
        mobileScreenshot: null,
        homepageMarkup,
        metrics: { isSecure, loadTime },
        brokenLinks: [],
        napDetails: {
          businessName: null,
          addresses: [],
          phoneNumbers: [],
          emails: [],
        },
      },
      blocked: false,
    };
  } catch (err: any) {
    const msg = err?.message || String(err);
    log("ERROR", "[STEALTH] Unexpected error during stealth scrape", {
      error: msg,
    });
    return { result: null, blocked: false };
  } finally {
    if (browser !== null) {
      log("DEBUG", "[STEALTH] Closing browser");
      try {
        await browser.close();
      } catch (closeErr: any) {
        log("WARN", "[STEALTH] Browser close threw (ignored)", {
          error: closeErr?.message,
        });
      }
    }
  }
}
