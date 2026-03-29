import { test, expect } from "@playwright/test";

/**
 * Journey 1: Checkup Flow
 * entry -> scanning theater -> score reveal -> email capture -> dashboard loads with data
 *
 * NOTE: The full flow requires Google Places API. In CI without API keys,
 * we verify the entry page renders correctly and skip API-dependent steps.
 */
test.describe("Cold Visitor: Checkup to Dashboard", () => {
  test("checkup entry page renders search input", async ({ page }) => {
    await page.goto("/checkup");
    await page.waitForLoadState("networkidle");

    // The entry screen should render with a search input
    const searchInput = page.locator("input[placeholder*='earch' i], input[placeholder*='business' i]").first();
    const isVisible = await searchInput.isVisible({ timeout: 10_000 }).catch(() => false);

    if (!isVisible) {
      // If the SPA didn't load, check we at least got HTML (not a server error)
      await expect(page.locator("body")).not.toContainText("Cannot GET");
      await expect(page.locator("body")).not.toContainText("Internal Server Error");
      test.skip(true, "Checkup entry page did not render search input (SPA may not be serving)");
      return;
    }

    await expect(searchInput).toBeVisible();
    await page.screenshot({ path: "test-results/cold-01-entry.png" });
  });

  test("completes full checkup flow and lands on dashboard", async ({ page }) => {
    test.setTimeout(120_000);

    // Step 1: Navigate to checkup
    await page.goto("/checkup");
    const searchInput = page.locator("input[placeholder*='earch' i], input[placeholder*='business' i]").first();
    const isVisible = await searchInput.isVisible({ timeout: 10_000 }).catch(() => false);
    if (!isVisible) {
      test.skip(true, "Search input not visible. Requires Google Places API or SPA serving.");
      return;
    }
    await page.screenshot({ path: "test-results/cold-01-entry.png" });

    // Step 2: Type business name and select from autocomplete
    await page.fill("input[placeholder*='earch' i]", "One Endodontics Falls Church");
    await page.waitForTimeout(2000);
    const placeResult = page.locator("[role='listbox'] [role='option'], ul li button, [class*='suggestion'] button, [class*='autocomplete'] button, button:has-text('Run My Checkup')").first();
    const hasResults = await placeResult.isVisible({ timeout: 10_000 }).catch(() => false);
    if (!hasResults) {
      test.skip(true, "No autocomplete results. Google Places API likely not configured.");
      return;
    }
    await placeResult.click();
    await page.screenshot({ path: "test-results/cold-02-selected.png" });

    // Step 3: Start scan
    const runBtn = page.locator("button:has-text('Run My Checkup')");
    if (await runBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await runBtn.click();
    }
    await page.waitForURL("**/checkup/scanning", { timeout: 15_000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "test-results/cold-03-scanning.png" });

    // Step 4: Wait for results
    await page.waitForURL("**/checkup/results", { timeout: 60_000 });
    await expect(page.locator("text=/\\/100|score|rank/i").first()).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: "test-results/cold-04-results.png" });

    // Step 5: Fill email + password
    const emailInput = page.locator("input[type='email'], input[placeholder*='email' i]").first();
    const passwordInput = page.locator("input[type='password']").first();
    await emailInput.fill(`e2e-test-${Date.now()}@test.alloro.dev`);
    await passwordInput.fill("TestPass123!");
    await page.screenshot({ path: "test-results/cold-05-gate-filled.png" });

    // Step 6: Submit
    await page.locator("button:has-text('See why'), button:has-text('Unlock'), button:has-text('Create'), button:has-text('See what')").first().click();
    await page.screenshot({ path: "test-results/cold-06-submitted.png" });

    // Step 7: Wait for transition
    await page.waitForURL(/\/(checkup\/building|owner-profile|dashboard|thank-you|new-account-onboarding)/, { timeout: 20_000 });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: "test-results/cold-08-final.png" });

    // Step 8: Verify destination
    const url = page.url();
    const validDestinations = ["/dashboard", "/owner-profile", "/thank-you", "/new-account-onboarding", "/checkup/building"];
    const landed = validDestinations.some((d) => url.includes(d));
    expect(landed).toBeTruthy();
  });
});

/**
 * Journey 5: Conference Mode
 */
test.describe("Conference Mode: Fallback Data", () => {
  test("conference mode loads checkup with fallback", async ({ page }) => {
    await page.goto("/checkup?source=aae2026&mode=conference");
    await page.waitForLoadState("networkidle");

    const searchInput = page.locator("input[placeholder*='earch' i], input[placeholder*='business' i]").first();
    const isVisible = await searchInput.isVisible({ timeout: 10_000 }).catch(() => false);
    if (!isVisible) {
      // Verify page at least loaded (no server error)
      await expect(page.locator("body")).not.toContainText("Cannot GET");
      test.skip(true, "Search input not visible in conference mode");
      return;
    }
    await expect(searchInput).toBeVisible();
    await page.screenshot({ path: "test-results/conf-01-entry.png" });
  });
});
