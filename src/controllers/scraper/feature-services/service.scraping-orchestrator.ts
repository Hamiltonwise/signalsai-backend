/**
 * Scraping orchestrator for the scraper module.
 *
 * Coordinates the full homepage scraping flow:
 * normalize URL -> launch browser -> navigate -> desktop screenshot ->
 * metrics -> broken links (background) -> NAP extraction -> mobile screenshot ->
 * close browser -> aggregate results.
 *
 * Default path uses Puppeteer. When the default path fails with a bot-block
 * (Cloudflare ERR_BLOCKED_BY_CLIENT etc.), the orchestrator escalates to
 * the Playwright + stealth manager. Both methods produce the same
 * `ScrapingResult` shape so downstream consumers don't care which won.
 *
 * Feature flag: `AUDIT_USE_STEALTH_FALLBACK=false` disables the stealth
 * escalation entirely (default-only mode). Default is `true`.
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
import { captureDesktop } from "./service.screenshot-capture";
import { collectMetrics } from "./service.performance-metrics";
import { findBrokenLinks } from "./service.link-checker";
import { scrapeHomepageStealth } from "./service.playwright-stealth-manager";

/**
 * Result of a scrape attempt at the orchestrator level.
 *
 * `result`:
 *   - non-null → scrape succeeded (default OR stealth path); use it.
 *   - null → both available methods exhausted, no usable scrape data.
 *
 * `blocked`:
 *   - true → null result was caused by bot-protection (CF etc.). The audit
 *     processor should mark `website_blocked=true` and skip website-side
 *     analysis without recommending the user "fix" the website.
 *   - false → null result was caused by something else (timeout, DNS,
 *     unrecoverable JS error). Processor still degrades to no-website
 *     but does NOT set the blocked flag.
 */
export interface ScrapeOutcome {
  result: ScrapingResult | null;
  blocked: boolean;
}

/**
 * Scrape a homepage and return aggregated results.
 *
 * Two-method chain:
 *   1. Default Puppeteer path. Fast, no extra deps.
 *   2. On bot-block (and only on bot-block): Playwright + stealth fallback.
 *      Disabled if `AUDIT_USE_STEALTH_FALLBACK=false`.
 *
 * Returns `{ result, blocked }` — see ScrapeOutcome doc above.
 *
 * Always closes any open Puppeteer browser before returning.
 *
 * @throws Re-throws unexpected errors after closing the browser.
 */
export async function scrapeHomepage(domain: string): Promise<ScrapeOutcome> {
  const defaultOutcome = await scrapeWithDefault(domain);

  if (defaultOutcome.result !== null) {
    log("INFO", "[CHAIN] default path succeeded");
    return defaultOutcome;
  }

  if (!defaultOutcome.blocked) {
    log("INFO", "[CHAIN] default path failed (non-block) — not escalating");
    return defaultOutcome;
  }

  const stealthEnabled = process.env.AUDIT_USE_STEALTH_FALLBACK !== "false";

  if (!stealthEnabled) {
    log(
      "INFO",
      "[CHAIN] default path blocked, AUDIT_USE_STEALTH_FALLBACK=false — skipping stealth"
    );
    return defaultOutcome;
  }

  log(
    "INFO",
    "[CHAIN] default path blocked — escalating to stealth (Playwright + stealth plugin)"
  );
  const stealthOutcome = await scrapeHomepageStealth(domain);

  if (stealthOutcome.result !== null) {
    log("INFO", "[CHAIN] stealth path succeeded");
    return stealthOutcome;
  }

  if (stealthOutcome.blocked) {
    log("WARN", "[CHAIN] both default and stealth paths blocked");
    return { result: null, blocked: true };
  }

  log(
    "WARN",
    "[CHAIN] stealth path failed (non-block) after default block — reporting as blocked"
  );
  // Default got blocked, stealth had a different failure mode. Treat as
  // blocked overall — the audit can't proceed with website data either way.
  return { result: null, blocked: true };
}

/**
 * Default Puppeteer scrape path. Same flow as the original `scrapeHomepage`,
 * extracted into a private helper so the public function can sit above the
 * chain logic. Behavior unchanged for sites that work — this is a pure
 * refactor of the original orchestrator function.
 */
async function scrapeWithDefault(domain: string): Promise<ScrapeOutcome> {
  const url = normalizeUrl(domain);
  let browser: Browser | null = null;

  try {
    browser = await launchBrowser();
    const page = await createPage(browser);

    log("DEBUG", "Navigating to URL", { url });
    const navResult = await navigateWithRetry(page, url);

    if (!navResult.ok) {
      await closeBrowser(browser);
      browser = null;
      return { result: null, blocked: navResult.blocked };
    }

    // Desktop screenshot (mobile capture intentionally dropped — single
    // viewport is enough for the leadgen audit and saves ~2-3s of scrape time)
    const desktopScreenshot = await captureDesktop(page);

    // Extract HTML markup
    const homepageMarkup = await page.content();
    const markupSize = Math.round(homepageMarkup.length / 1024);
    log("INFO", "Homepage markup captured", { sizeKB: markupSize });

    // Performance metrics (load time, HTTPS)
    const metrics = await collectMetrics(page);

    // Broken links check (capped at 1 — just a health signal). The audit
    // pipeline uses only the COUNT for Technical Reliability scoring.
    // Must finish before browser close: link-checker evaluates JS on the
    // live page; closing the target mid-call throws TargetCloseError.
    // NAP extraction intentionally skipped — audit pipeline derives NAP
    // from the raw markup via the LLM, not from this scraper.
    log("INFO", "Starting broken links check (max 1)");
    const brokenLinks = await findBrokenLinks(page, page.url(), 1);
    log("INFO", "Broken links check completed", {
      brokenCount: brokenLinks.length,
    });

    // Close browser
    await closeBrowser(browser);
    browser = null;

    return {
      result: {
        desktopScreenshot,
        mobileScreenshot: null,
        homepageMarkup,
        metrics,
        brokenLinks,
        napDetails: {
          businessName: null,
          addresses: [],
          phoneNumbers: [],
          emails: [],
        },
      },
      blocked: false,
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
