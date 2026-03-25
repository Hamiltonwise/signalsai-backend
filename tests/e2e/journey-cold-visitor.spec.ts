import { test, expect } from "@playwright/test";

test.describe("Cold Visitor: Checkup to Dashboard", () => {
  test("completes full checkup flow and lands on dashboard", async ({ page }) => {
    // Step 1: Navigate to checkup
    await page.goto("/checkup");
    await expect(page.locator("input[placeholder='Search your business name...']")).toBeVisible();
    await page.screenshot({ path: "test-results/cold-01-entry.png" });

    // Step 2: Type practice name and select from autocomplete
    await page.fill("input[placeholder='Search your business name...']", "One Endodontics Falls Church");
    await page.waitForTimeout(1500); // debounce + API
    const autocompleteItem = page.locator("[class*='autocomplete'] >> text=/One Endo/i").first();
    // Fallback: try clicking first list item if autocomplete renders differently
    const dropdown = autocompleteItem.or(page.locator("ul li, [role='listbox'] [role='option']").first());
    await dropdown.waitFor({ state: "visible", timeout: 10_000 });
    await dropdown.click();
    await page.screenshot({ path: "test-results/cold-02-selected.png" });

    // Step 3: Scanning Theater renders
    await page.waitForURL("**/checkup/scanning", { timeout: 10_000 });
    await expect(page.locator("text=/Scanning Google Business Profile|Finding your business/i")).toBeVisible();
    await page.screenshot({ path: "test-results/cold-03-scanning.png" });

    // Step 4: Wait for score reveal
    await page.waitForURL("**/checkup/results", { timeout: 30_000 });
    await expect(page.locator("text=/\\/100|score/i")).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: "test-results/cold-04-results.png" });

    // Step 5: Fill blur gate (account creation)
    const emailInput = page.locator("input[type='email'], input[placeholder*='email' i]");
    const passwordInput = page.locator("input[type='password'], input[placeholder*='password' i]");
    await emailInput.fill(`e2e-test-${Date.now()}@test.alloro.dev`);
    await passwordInput.fill("TestPass123!");
    await page.screenshot({ path: "test-results/cold-05-gate-filled.png" });

    // Step 6: Submit
    await page.locator("button:has-text('Unlock')").click();
    await page.screenshot({ path: "test-results/cold-06-submitted.png" });

    // Step 7: Assert redirect to dashboard or building screen
    await page.waitForURL("**/dashboard**", { timeout: 15_000 });
    // Dashboard should have at least one visible data element
    const dashboardContent = page.locator("h1, [class*='card'], [class*='score'], [class*='position']").first();
    await expect(dashboardContent).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: "test-results/cold-07-dashboard.png" });
  });
});
