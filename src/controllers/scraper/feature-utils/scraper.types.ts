/**
 * Shared type definitions for the scraper module.
 *
 * These types define the contracts between the controller, services, and utilities
 * that make up the scraper feature. No runtime code here — compile-time only.
 */

/** Request body for POST /scraper/homepage */
export interface HomepageRequest {
  domain: string;
}

/** NAP (Name, Address, Phone) business details extracted from a page */
export interface NAPDetails {
  businessName: string | null;
  addresses: string[];
  phoneNumbers: string[];
  emails: string[];
}

/** A broken link detected on the page */
export interface BrokenLink {
  url: string;
  status: number | string;
}

/** Response shape for POST /scraper/homepage */
export interface HomepageResponse {
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

/** Error response shape when page cannot be loaded */
export interface ScraperErrorResponse {
  error: true;
  error_message: string;
}

/** Result of a single screenshot capture */
export interface ScreenshotResult {
  base64: string;
  sizeKB: number;
}

/** Page performance metrics */
export interface PerformanceMetrics {
  loadTime: number;
  isSecure: boolean;
}

/** Aggregated result from the scraping orchestrator */
export interface ScrapingResult {
  desktopScreenshot: ScreenshotResult;
  mobileScreenshot: ScreenshotResult;
  homepageMarkup: string;
  metrics: PerformanceMetrics;
  brokenLinks: BrokenLink[];
  napDetails: NAPDetails;
}
