import { test, expect } from "@playwright/test";
import { pages, type PageEntry } from "./page-manifest";
import * as fs from "fs";
import * as path from "path";

/**
 * Screenshot Audit Utility
 *
 * Captures screenshots of Alloro pages for visual review by Claude Code.
 *
 * Usage:
 *   npx playwright test screenshot-audit              # Tier 1 only (fast, ~40s)
 *   npx playwright test screenshot-audit --grep tier2  # Tier 1+2
 *   npx playwright test screenshot-audit --grep tier3  # All pages
 *   npx playwright test screenshot-audit --grep "dashboard"  # Specific page
 *
 * Screenshots saved to: screenshots/
 *
 * Environment:
 *   PLAYWRIGHT_BASE_URL=http://localhost:5174  (default: localhost:3000)
 *   SCREENSHOT_VIEWPORT=mobile                 (default: desktop 1280x720)
 */

const SCREENSHOT_DIR = path.resolve(__dirname, "../../screenshots");
const VIEWPORT_DESKTOP = { width: 1280, height: 720 };
const VIEWPORT_MOBILE = { width: 375, height: 812 };

// Ensure screenshot directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const isMobile = process.env.SCREENSHOT_VIEWPORT === "mobile";
const viewport = isMobile ? VIEWPORT_MOBILE : VIEWPORT_DESKTOP;
const suffix = isMobile ? "-mobile" : "";

// Auth tokens, populated in beforeAll
let clientToken = "";
let clientOrgId = "";
let clientRole = "";

// ─── Health check + auth ────────────────────────────────────────────

test.beforeAll(async ({ request }) => {
  // Health check
  try {
    const health = await request.get("/api/health", { timeout: 5000 });
    if (!health.ok()) {
      console.warn("Backend health check failed. Public pages only.");
    }
  } catch {
    console.warn("Backend not reachable. Public/marketing pages only.");
    return;
  }

  // Get demo auth token
  try {
    const res = await request.get("/api/demo/login");
    const data = await res.json();
    if (data.success && data.token) {
      clientToken = data.token;
      clientOrgId = String(data.user?.organizationId || "");
      clientRole = data.user?.role || "admin";
    }
  } catch {
    console.warn("Demo login failed. Only public pages will be captured.");
  }
});

// ─── Helper: authenticate and navigate ──────────────────────────────

async function captureScreenshot(
  page: any,
  entry: PageEntry,
) {
  // Set viewport
  await page.setViewportSize(viewport);

  // Clear stale state
  await page.goto("/", { waitUntil: "commit" });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  // Inject auth if needed
  if (entry.auth !== "none" && clientToken) {
    await page.evaluate(
      ({ token, orgId, role }: { token: string; orgId: string; role: string }) => {
        // Set in both storage types to cover all code paths
        localStorage.setItem("auth_token", token);
        sessionStorage.setItem("auth_token", token);
        sessionStorage.setItem("token", token);
        if (orgId) {
          localStorage.setItem("organizationId", orgId);
          sessionStorage.setItem("organizationId", orgId);
        }
        if (role) {
          localStorage.setItem("user_role", role);
          sessionStorage.setItem("user_role", role);
        }
      },
      { token: clientToken, orgId: clientOrgId, role: clientRole },
    );
  }

  // Navigate
  await page.goto(entry.route, { waitUntil: "domcontentloaded", timeout: 15000 });

  // Wait for lazy loading to complete
  // Admin pages need more time for auth validation + data fetch chain
  const waitTime = entry.auth === "admin" ? 3000 : 1500;
  await page.waitForTimeout(waitTime);

  try {
    await page.waitForFunction(
      () => {
        const spinners = document.querySelectorAll(
          '[class*="animate-spin"], [class*="loading"], [class*="skeleton"]'
        );
        // Allow some skeletons (they may be intentional), but wait for main spinners
        const mainSpinner = document.querySelector(
          '.animate-spin:not([class*="skeleton"])'
        );
        return !mainSpinner;
      },
      { timeout: 8000 },
    );
  } catch {
    // Timeout waiting for spinners is ok, take screenshot anyway
  }

  // Extra wait for animations to settle
  await page.waitForTimeout(500);

  // Take screenshot
  const filePath = path.join(
    SCREENSHOT_DIR,
    `${entry.name}${suffix}.png`,
  );

  await page.screenshot({
    path: filePath,
    fullPage: true,
  });

  return filePath;
}

// ─── Tier 1 Tests ───────────────────────────────────────────────────

const tier1Pages = pages.filter((p) => p.tier === 1);

test.describe("tier1", () => {
  for (const entry of tier1Pages) {
    test(`${entry.name}`, async ({ page }) => {
      if (entry.auth !== "none" && !clientToken) {
        test.skip(true, "No auth token. Run backend + seed:demo first.");
        return;
      }

      const filePath = await captureScreenshot(page, entry);

      // Verify file was created
      expect(fs.existsSync(filePath)).toBe(true);

      // Basic sanity: page should not show server error
      const body = await page.locator("body").textContent();
      expect(body).not.toContain("Internal Server Error");
      expect(body).not.toContain("Cannot GET");
    });
  }
});

// ─── Tier 2 Tests ───────────────────────────────────────────────────

const tier2Pages = pages.filter((p) => p.tier === 2);

test.describe("tier2", () => {
  for (const entry of tier2Pages) {
    test(`${entry.name}`, async ({ page }) => {
      if (entry.auth !== "none" && !clientToken) {
        test.skip(true, "No auth token. Run backend + seed:demo first.");
        return;
      }

      const filePath = await captureScreenshot(page, entry);
      expect(fs.existsSync(filePath)).toBe(true);
    });
  }
});

// ─── Tier 3 Tests ───────────────────────────────────────────────────

const tier3Pages = pages.filter((p) => p.tier === 3);

test.describe("tier3", () => {
  for (const entry of tier3Pages) {
    test(`${entry.name}`, async ({ page }) => {
      const filePath = await captureScreenshot(page, entry);
      expect(fs.existsSync(filePath)).toBe(true);
    });
  }
});
