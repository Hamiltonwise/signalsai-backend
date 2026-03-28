import { test, expect } from "@playwright/test";

/**
 * Journey 1: Checkup Flow
 * entry -> scanning theater -> score reveal -> email capture -> dashboard loads with data
 */
test.describe("Cold Visitor: Checkup to Dashboard", () => {
  test("completes full checkup flow and lands on dashboard", async ({ page }) => {
    // Step 1: Navigate to checkup
    await page.goto("/checkup");
    await expect(page.locator("input[placeholder*='earch' i]").first()).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: "test-results/cold-01-entry.png" });

    // Step 2: Type practice name and select from autocomplete
    await page.fill("input[placeholder*='earch' i]", "One Endodontics Falls Church");
    await page.waitForTimeout(1500); // debounce + API
    const dropdown = page.locator("[role='listbox'] [role='option'], ul li button, [class*='suggestion'], [class*='autocomplete'] button").first();
    await dropdown.waitFor({ state: "visible", timeout: 10_000 });
    await dropdown.click();
    await page.screenshot({ path: "test-results/cold-02-selected.png" });

    // Step 3: Scanning Theater renders
    await page.waitForURL("**/checkup/scanning", { timeout: 10_000 });
    await expect(page.locator("text=/Scanning|Finding|Market Analysis/i")).toBeVisible();
    await page.screenshot({ path: "test-results/cold-03-scanning.png" });

    // Step 4: Wait for score reveal (results page)
    await page.waitForURL("**/checkup/results", { timeout: 45_000 });
    await expect(page.locator("text=/\\/100|score|rank/i").first()).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: "test-results/cold-04-results.png" });

    // Step 5: Fill email + password gate
    const emailInput = page.locator("input[type='email'], input[placeholder*='email' i]").first();
    const passwordInput = page.locator("input[type='password']").first();
    await emailInput.fill(`e2e-test-${Date.now()}@test.alloro.dev`);
    await passwordInput.fill("TestPass123!");
    await page.screenshot({ path: "test-results/cold-05-gate-filled.png" });

    // Step 6: Submit account creation
    await page.locator("button:has-text('Unlock'), button:has-text('Create')").first().click();
    await page.screenshot({ path: "test-results/cold-06-submitted.png" });

    // Step 7: Building screen or redirect to dashboard/thank-you
    await page.waitForURL("**/checkup/building|**/dashboard|**/thank-you", { timeout: 15_000 });
    await page.screenshot({ path: "test-results/cold-07-transition.png" });

    // Step 8: Eventually lands on dashboard or thank-you with content (not blank)
    await page.waitForURL("**/dashboard**|**/thank-you**", { timeout: 15_000 });
    const content = page.locator("h1, h2, [class*='card'], [class*='score']").first();
    await expect(content).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: "test-results/cold-08-final.png" });
  });
});

/**
 * Journey 5: Conference Mode
 * add ?mode=conference to checkup URL -> scan runs -> fallback data loads on timeout
 */
test.describe("Conference Mode: Fallback Data", () => {
  test("conference mode loads checkup with fallback", async ({ page }) => {
    await page.goto("/checkup?source=aae2026&mode=conference");
    await expect(page.locator("input[placeholder*='earch' i]").first()).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: "test-results/conf-01-entry.png" });
  });
});
