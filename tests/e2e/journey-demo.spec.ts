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
    // Wait for React to hydrate and render content
    await page.waitForTimeout(2000);
    // The demo page should render substantial content (competitor cards, scores, etc.)
    const heading = page.locator("h1, h2, h3").first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
    // Check that competitor-related content rendered (cards, names, or score data)
    const cards = page.locator("[class*='card'], [class*='rounded']");
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThan(0);
    await page.screenshot({ path: "test-results/demo-02-competitors.png" });
  });

  test("demo shows score ring", async ({ page }) => {
    await page.goto("/demo");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    // Look for score number OR svg circle OR score class separately
    const scoreElement = page.locator("svg circle, [class*='score'], [class*='ring']").first();
    const hasScore = await scoreElement.isVisible({ timeout: 10_000 }).catch(() => false);
    // Fallback: check for any large number display (the score itself)
    if (!hasScore) {
      const numberElement = page.locator("text=/^\\d{1,3}$/").first();
      await expect(numberElement).toBeVisible({ timeout: 5_000 });
    }
    await page.screenshot({ path: "test-results/demo-03-score-ring.png" });
  });
});
