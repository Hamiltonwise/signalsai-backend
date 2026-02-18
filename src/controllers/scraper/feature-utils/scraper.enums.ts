/**
 * Constants and configuration values for the scraper module.
 *
 * Viewport dimensions, user-agent strings, and log levels.
 * These replace magic numbers scattered across the original monolithic route.
 */

/** Viewport dimensions for desktop and mobile captures */
export const ViewportConfig = {
  DESKTOP: { width: 1280, height: 720, deviceScaleFactor: 1 },
  MOBILE: {
    width: 375,
    height: 667,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  },
} as const;

/** User-agent strings for desktop and mobile contexts */
export const UserAgent = {
  DESKTOP:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  MOBILE:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
} as const;

/** Log levels for the scraper file logger */
export type LogLevel = "INFO" | "ERROR" | "DEBUG" | "WARN";
