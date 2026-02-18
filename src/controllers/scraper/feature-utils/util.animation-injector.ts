/**
 * Animation visibility injector for the scraper module.
 *
 * Injects CSS into a Puppeteer page to force-show elements hidden
 * by animation libraries. This ensures full-page screenshots capture
 * all content, even if it relies on scroll-triggered animations.
 *
 * Supported libraries:
 * - Elementor (.elementor-invisible)
 * - WOW.js (.wow)
 * - AOS / Animate On Scroll ([data-aos])
 * - GSAP ScrollTrigger (.gsap-hidden, [data-gsap])
 * - Generic (.animate__animated, .animated)
 * - Disables all CSS transitions and animations (0s duration)
 */

import { Page } from "puppeteer";

const ANIMATION_OVERRIDE_CSS = `
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
`;

/**
 * Inject CSS that forces all animation-hidden elements to be visible.
 *
 * Must be called before each screenshot (desktop and mobile) because
 * viewport changes can trigger re-renders that re-apply animation classes.
 */
export async function injectAnimationCSS(page: Page): Promise<void> {
  await page.addStyleTag({ content: ANIMATION_OVERRIDE_CSS });
}
