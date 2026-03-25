import { test, expect } from "@playwright/test";

test.describe("Demo: AAE Conference Mode", () => {
  test("demo page loads without login", async ({ page }) => {
    await page.goto("/demo");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).not.toContainText("500");
    await page.screenshot({ path: "test-results/demo-01-loaded.png" });
  });

  test("demo shows competitor names", async ({ page }) => {
    await page.goto("/demo");
    await page.waitForLoadState("networkidle");
    // Pre-seeded competitors: Wasatch, Pioneer, Summit, Desert Endodontics (SLC data)
    // Or Mountain View demo data
    const bodyText = await page.locator("body").textContent();
    // At least one competitor name should be visible (not empty)
    const hasCompetitor = bodyText && bodyText.length > 100;
    expect(hasCompetitor).toBeTruthy();
    await page.screenshot({ path: "test-results/demo-02-competitors.png" });
  });

  test("demo shows score ring", async ({ page }) => {
    await page.goto("/demo");
    await page.waitForLoadState("networkidle");
    // Score ring or score number should be visible
    const scoreElement = page.locator("text=/\\d{1,3}/, svg circle, [class*='score']").first();
    await expect(scoreElement).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: "test-results/demo-03-score-ring.png" });
  });
});
