/**
 * URL Scrape Strategies
 *
 * Three strategies for getting text content out of a URL:
 *   - fetch: basic axios.get (fast, fails on WAF-protected sites)
 *   - browser: Puppeteer renders the page, returns post-JS HTML (bypasses most challenges)
 *   - screenshot: Puppeteer full-page screenshot → Claude vision text extraction
 *
 * The identity warmup picks a strategy per URL based on admin selection.
 * The browser + screenshot strategies reuse the shared Puppeteer manager
 * (src/controllers/scraper/feature-services/service.puppeteer-manager.ts)
 * — no new browser instances are launched outside of it.
 */

import { runAgent } from "../../../agents/service.llm-runner";
import { loadPrompt } from "../../../agents/service.prompt-loader";
import { scrapeWebsite } from "./service.website-scraper";
import {
  launchBrowser,
  createPage,
  setDesktopViewport,
  navigateWithRetry,
  closeBrowser,
} from "../../scraper/feature-services/service.puppeteer-manager";
import { captureDesktop } from "../../scraper/feature-services/service.screenshot-capture";

export type ScrapeStrategy = "fetch" | "browser" | "screenshot";

export interface ScrapeResult {
  baseUrl: string;
  pages: Record<string, string>;
  images: string[];
  strategy_used: ScrapeStrategy;
  was_blocked: boolean;
  extracted_text?: string;
}

function log(msg: string, data?: Record<string, unknown>): void {
  console.log(`[ScrapeStrategies] ${msg}`, data ? JSON.stringify(data) : "");
}

// ---------------------------------------------------------------------------
// PUBLIC: scrape(url, strategy)
// ---------------------------------------------------------------------------

export async function scrapeUrl(
  url: string,
  strategy: ScrapeStrategy = "fetch",
): Promise<ScrapeResult> {
  log(`Scraping ${url} with strategy=${strategy}`);

  switch (strategy) {
    case "fetch":
      return await scrapeWithFetch(url);
    case "browser":
      return await scrapeWithBrowser(url);
    case "screenshot":
      return await scrapeWithScreenshot(url);
    default:
      return await scrapeWithFetch(url);
  }
}

// ---------------------------------------------------------------------------
// FETCH (default)
// ---------------------------------------------------------------------------

async function scrapeWithFetch(url: string): Promise<ScrapeResult> {
  const result = await scrapeWebsite(url, undefined);
  if (result.result) {
    return {
      baseUrl: result.result.baseUrl,
      pages: result.result.pages,
      images: result.result.images,
      strategy_used: "fetch",
      was_blocked: false,
    };
  }
  // Fetch failed — return an empty result rather than throw, so warmup can continue
  return {
    baseUrl: url,
    pages: {},
    images: [],
    strategy_used: "fetch",
    was_blocked: true,
  };
}

// ---------------------------------------------------------------------------
// BROWSER (Puppeteer-rendered HTML)
// ---------------------------------------------------------------------------

async function scrapeWithBrowser(url: string): Promise<ScrapeResult> {
  let browser = null;
  try {
    browser = await launchBrowser();
    const page = await createPage(browser);
    await setDesktopViewport(page);

    const navigated = await navigateWithRetry(page, url);
    if (!navigated) {
      return emptyResult(url, "browser", true);
    }

    // Wait briefly for any post-load JS / redirects (Cloudflare JS challenges resolve in ~4-5s)
    await new Promise((r) => setTimeout(r, 5000));

    const html = await page.content();
    const images = await extractImageUrls(page);

    return {
      baseUrl: url,
      pages: { home: html },
      images,
      strategy_used: "browser",
      was_blocked: false,
    };
  } catch (err: any) {
    log("Browser strategy failed", { error: err.message });
    return emptyResult(url, "browser", true);
  } finally {
    if (browser) await closeBrowser(browser);
  }
}

async function extractImageUrls(page: any): Promise<string[]> {
  try {
    const urls: string[] = await page.evaluate(() => {
      const set = new Set<string>();
      const imgs = document.querySelectorAll("img");
      imgs.forEach((img: any) => {
        const src = img.getAttribute("src") || img.getAttribute("data-src") || "";
        if (src && /^https?:\/\//.test(src)) set.add(src);
      });
      return Array.from(set).slice(0, 20);
    });
    return urls;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// SCREENSHOT (Puppeteer + Claude vision)
// ---------------------------------------------------------------------------

async function scrapeWithScreenshot(url: string): Promise<ScrapeResult> {
  let browser = null;
  try {
    browser = await launchBrowser();
    const page = await createPage(browser);
    await setDesktopViewport(page);

    const navigated = await navigateWithRetry(page, url);
    if (!navigated) {
      return emptyResult(url, "screenshot", true);
    }

    await new Promise((r) => setTimeout(r, 5000));

    const shot = await captureDesktop(page);
    if (!shot?.base64) {
      return emptyResult(url, "screenshot", true);
    }

    log("Captured screenshot", { sizeKB: shot.sizeKB });

    const extractorPrompt = loadPrompt("websiteAgents/builder/ScreenshotTextExtractor");
    const extraction = await runAgent({
      systemPrompt: extractorPrompt,
      userMessage: `URL: ${url}\n\nExtract the readable text content from this screenshot.`,
      images: [{ mediaType: "image/jpeg", base64: shot.base64 }],
      maxTokens: 4096,
    });

    const extractedText = extraction.raw.trim();

    return {
      baseUrl: url,
      pages: { home: extractedText },
      images: [],
      strategy_used: "screenshot",
      was_blocked: false,
      extracted_text: extractedText,
    };
  } catch (err: any) {
    log("Screenshot strategy failed", { error: err.message });
    return emptyResult(url, "screenshot", true);
  } finally {
    if (browser) await closeBrowser(browser);
  }
}

function emptyResult(
  url: string,
  strategy: ScrapeStrategy,
  was_blocked: boolean,
): ScrapeResult {
  return {
    baseUrl: url,
    pages: {},
    images: [],
    strategy_used: strategy,
    was_blocked,
  };
}
