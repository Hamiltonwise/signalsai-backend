/**
 * Auto-scroll utility for the scraper module.
 *
 * Scrolls through the entire page to trigger lazy-loaded content and
 * scroll-based animations (Elementor, WOW.js, AOS, etc.).
 * Scrolls back to top when done so the screenshot starts from the top.
 *
 * Scroll parameters:
 * - Distance: 400px per step
 * - Delay: 80ms between steps
 */

import { Page } from "puppeteer";

/**
 * Auto-scroll through the entire page to trigger lazy-loaded content.
 *
 * Scrolls 400px at a time with 80ms pauses, then scrolls back to top.
 * This is critical for pages that load images and animations on scroll.
 */
export async function autoScrollPage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let totalHeight = 0;
      const distance = 600; // larger steps cover the page faster
      const delay = 30; // tighter loop — most lazy-loaders react in <30ms

      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, delay);
    });
  });
}
