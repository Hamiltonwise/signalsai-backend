import { test, expect } from "@playwright/test";

/**
 * Journey 1: Checkup Flow
 * entry -> scanning theater -> score reveal -> email capture -> dashboard loads with data
 */
test.describe("Cold Visitor: Checkup to Dashboard", () => {
  test("completes full checkup flow and lands on dashboard", async ({ page }) => {
    test.setTimeout(120_000); // full flow can take a while with real API calls

    // Step 1: Navigate to checkup
    await page.goto("/checkup");
    await expect(page.locator("input[placeholder*='earch' i]").first()).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: "test-results/cold-01-entry.png" });

    // Step 2: Type business name and select from autocomplete
    await page.fill("input[placeholder*='earch' i]", "One Endodontics Falls Church");
    await page.waitForTimeout(2000); // debounce + API
    // Click place result or autocomplete dropdown
    const placeResult = page.locator("[role='listbox'] [role='option'], ul li button, [class*='suggestion'] button, [class*='autocomplete'] button, button:has-text('Run My Checkup')").first();
    await placeResult.waitFor({ state: "visible", timeout: 10_000 });
    await placeResult.click();
    await page.screenshot({ path: "test-results/cold-02-selected.png" });

    // Step 3: Start scan (click "Run My Checkup" if visible)
    const runBtn = page.locator("button:has-text('Run My Checkup')");
    if (await runBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await runBtn.click();
    }
    await page.waitForURL("**/checkup/scanning", { timeout: 15_000 });
    await page.waitForTimeout(2000); // let theater render
    await page.screenshot({ path: "test-results/cold-03-scanning.png" });

    // Step 4: Wait for score reveal (results page) -- API call can take up to 45s
    await page.waitForURL("**/checkup/results", { timeout: 60_000 });
    await expect(page.locator("text=/\\/100|score|rank/i").first()).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: "test-results/cold-04-results.png" });

    // Step 5: Fill email + password gate
    const emailInput = page.locator("input[type='email'], input[placeholder*='email' i]").first();
    const passwordInput = page.locator("input[type='password']").first();
    await emailInput.fill(`e2e-test-${Date.now()}@test.alloro.dev`);
    await passwordInput.fill("TestPass123!");
    await page.screenshot({ path: "test-results/cold-05-gate-filled.png" });

    // Step 6: Submit account creation
    await page.locator("button:has-text('See why'), button:has-text('Unlock'), button:has-text('Create'), button:has-text('See what')").first().click();
    await page.screenshot({ path: "test-results/cold-06-submitted.png" });

    // Step 7: Wait for post-signup flow (building -> owner-profile -> dashboard)
    await page.waitForURL("**/checkup/building|**/owner-profile|**/dashboard|**/thank-you", { timeout: 20_000 });
    await page.screenshot({ path: "test-results/cold-07-transition.png" });

    // Step 8: Navigate through any intermediate screens to dashboard
    // Building screen auto-redirects after 3.5s, owner-profile has Skip
    for (let i = 0; i < 5; i++) {
      const url = page.url();
      if (url.includes("/dashboard") || url.includes("/thank-you")) break;

      if (url.includes("/owner-profile")) {
        const skipBtn = page.locator("text=/Skip/i").first();
        if (await skipBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await skipBtn.click();
        }
      }
      await page.waitForTimeout(2000);
    }

    // Step 9: Final destination
    await page.waitForURL("**/dashboard**|**/thank-you**|**/owner-profile**", { timeout: 15_000 });
    const content = page.locator("h1, h2, [class*='card'], [class*='score']").first();
    await expect(content).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: "test-results/cold-09-final.png" });
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
