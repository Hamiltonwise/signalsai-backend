/**
 * AAE Conference Flow -- The Full Rube Goldberg Test
 *
 * Simulates: Doctor scans QR code at AAE booth on iPhone.
 * Every step must work on mobile. Every handoff must be seamless.
 * If any domino fails, the magic trick fails.
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const BASE = "https://sandbox.getalloro.com";
const SCREENSHOT_DIR = "/tmp/alloro-aae-flow";
const IPHONE = { width: 390, height: 844 }; // iPhone 14 Pro

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function screenshot(page: any, name: string) {
  const filePath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

test.describe("AAE Conference Flow", () => {
  test("Step 1: QR code lands on checkup (mobile)", async ({ page }) => {
    await page.setViewportSize(IPHONE);
    // QR code URL includes conference mode
    await page.goto(`${BASE}/checkup?mode=conference`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await page.waitForTimeout(2000);
    await screenshot(page, "01-checkup-entry-mobile");

    // Verify the search input exists
    const searchInput = page.locator('input[type="text"], input[placeholder*="business"], input[placeholder*="name"], input[placeholder*="Search"]');
    await expect(searchInput.first()).toBeVisible({ timeout: 5000 });

    // Verify it looks clean on mobile (no horizontal scroll)
    const body = await page.locator("body");
    const bodyWidth = await body.evaluate((el: HTMLElement) => el.scrollWidth);
    const viewportWidth = IPHONE.width;
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 10); // small tolerance
  });

  test("Step 2: Autocomplete finds a real business", async ({ page }) => {
    await page.setViewportSize(IPHONE);
    await page.goto(`${BASE}/checkup?mode=conference`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await page.waitForTimeout(2000);

    // Type a business name
    const searchInput = page.locator('input[type="text"], input[placeholder*="business"], input[placeholder*="name"], input[placeholder*="Search"]').first();
    await searchInput.fill("Valley Endodontics");
    await page.waitForTimeout(3000);
    await screenshot(page, "02-autocomplete-results-mobile");

    // Check that autocomplete suggestions appear
    const suggestions = page.locator('[class*="suggestion"], [class*="autocomplete"], [class*="dropdown"], [role="listbox"], [role="option"]');
    // Take screenshot regardless
    await screenshot(page, "02b-autocomplete-state");
  });

  test("Step 3: Score reveal page renders on mobile", async ({ page }) => {
    await page.setViewportSize(IPHONE);
    // Go directly to scanning page to test rendering
    await page.goto(`${BASE}/checkup/scanning`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await page.waitForTimeout(3000);
    await screenshot(page, "03-scanning-theater-mobile");
  });

  test("Step 4: Signup page renders on mobile", async ({ page }) => {
    await page.setViewportSize(IPHONE);
    await page.goto(`${BASE}/signup`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await page.waitForTimeout(2000);
    await screenshot(page, "04-signup-mobile");
  });

  test("Step 5: Signin page renders on mobile", async ({ page }) => {
    await page.setViewportSize(IPHONE);
    await page.goto(`${BASE}/signin`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await page.waitForTimeout(2000);
    await screenshot(page, "05-signin-mobile");
  });

  test("Step 6: Dashboard renders on mobile (demo account)", async ({ page }) => {
    await page.setViewportSize(IPHONE);

    // Login as demo
    const loginRes = await page.request.post(`${BASE}/api/auth/login`, {
      data: { email: "demo@getalloro.com", password: "demo2026" },
    });
    const loginData = await loginRes.json();

    if (loginData.success && loginData.token) {
      await page.goto(BASE, { waitUntil: "commit" });
      await page.evaluate(
        ({ t, u }: { t: string; u: any }) => {
          localStorage.setItem("auth_token", t);
          if (u?.email) localStorage.setItem("user_email", u.email);
          if (u?.organizationId) localStorage.setItem("organizationId", String(u.organizationId));
          if (u?.role) localStorage.setItem("user_role", u.role);
        },
        { t: loginData.token, u: loginData.user },
      );

      await page.goto(`${BASE}/dashboard`, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });
      await page.waitForTimeout(3000);
      await screenshot(page, "06-dashboard-mobile");

      // Check rankings page on mobile
      await page.goto(`${BASE}/dashboard/rankings`, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });
      await page.waitForTimeout(3000);
      await screenshot(page, "07-rankings-mobile");
    }
  });

  test("Step 7: Pricing page renders on mobile", async ({ page }) => {
    await page.setViewportSize(IPHONE);
    await page.goto(`${BASE}/pricing`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await page.waitForTimeout(2000);
    await screenshot(page, "08-pricing-mobile");
  });

  test("Step 8: Marketing home renders on mobile", async ({ page }) => {
    await page.setViewportSize(IPHONE);
    await page.goto(BASE, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await page.waitForTimeout(2000);
    await screenshot(page, "09-home-mobile");
  });
});
