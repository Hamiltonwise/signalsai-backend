/**
 * Screenshot capture service for the scraper module.
 *
 * Handles the full screenshot flow for both desktop and mobile:
 * inject animation CSS -> auto-scroll -> wait -> capture JPEG (base64, 70% quality).
 */

import { Page } from "puppeteer";
import { ScreenshotResult } from "../feature-utils/scraper.types";
import { injectAnimationCSS } from "../feature-utils/util.animation-injector";
import { autoScrollPage } from "../feature-utils/util.page-scroller";
import { log } from "../feature-utils/util.scraper-logger";
import {
  setDesktopViewport,
  setMobileViewport,
} from "./service.puppeteer-manager";

/** Wait time in ms after scrolling for animations to settle */
const ANIMATION_SETTLE_MS = 1000;

/** JPEG quality for screenshots (0-100) */
const SCREENSHOT_QUALITY = 70;

/**
 * Capture a full-page screenshot with the current viewport settings.
 *
 * 1. Inject animation CSS to force-show hidden animated elements
 * 2. Auto-scroll the page to trigger lazy-loaded content
 * 3. Wait 1s for animations to settle
 * 4. Capture full-page JPEG at 70% quality (base64)
 */
async function captureScreenshot(
  page: Page,
  label: string
): Promise<ScreenshotResult> {
  log("DEBUG", `${label}: injecting animation visibility CSS`);
  await injectAnimationCSS(page);

  log("DEBUG", `${label}: auto-scrolling to trigger lazy content`);
  await autoScrollPage(page);

  log("DEBUG", `${label}: waiting ${ANIMATION_SETTLE_MS}ms for animations to settle`);
  await new Promise((resolve) => setTimeout(resolve, ANIMATION_SETTLE_MS));

  log("DEBUG", `${label}: taking screenshot (full page, JPEG ${SCREENSHOT_QUALITY}% quality)`);
  const base64 = (await page.screenshot({
    fullPage: true,
    encoding: "base64",
    type: "jpeg",
    quality: SCREENSHOT_QUALITY,
  })) as string;

  const sizeKB = Math.round(base64.length / 1024);
  log("INFO", `${label} screenshot captured`, { sizeKB });

  return { base64, sizeKB };
}

/**
 * Capture a desktop screenshot (1280x720 viewport).
 *
 * Sets the desktop viewport/user-agent, then runs the standard
 * inject -> scroll -> wait -> capture flow.
 */
export async function captureDesktop(page: Page): Promise<ScreenshotResult> {
  await setDesktopViewport(page);
  return captureScreenshot(page, "Desktop");
}

/**
 * Capture a mobile screenshot (375x667 viewport, iPhone SE).
 *
 * Sets the mobile viewport/user-agent, then runs the standard
 * inject -> scroll -> wait -> capture flow.
 *
 * Note: Animation CSS must be re-injected because the viewport change
 * triggers a re-render that can re-apply animation classes.
 */
export async function captureMobile(page: Page): Promise<ScreenshotResult> {
  await setMobileViewport(page);
  log("DEBUG", "Mobile viewport set, injecting animation visibility CSS (no reload - viewport change triggers re-render)");
  return captureScreenshot(page, "Mobile");
}
