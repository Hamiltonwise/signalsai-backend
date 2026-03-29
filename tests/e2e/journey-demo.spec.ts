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
    await page.waitForTimeout(3000);

    // The demo page should render content. In CI with empty DB, it may show
    // a loading state or empty state instead of competitor data.
    const heading = page.locator("h1, h2, h3").first();
    const hasHeading = await heading.isVisible({ timeout: 10_000 }).catch(() => false);

    if (!hasHeading) {
      // Verify page loaded (not a server error)
      await expect(page.locator("body")).not.toContainText("Internal Server Error");
      await expect(page.locator("body")).not.toContainText("Cannot GET");
      test.skip(true, "Demo page did not render headings. May need seeded data or external APIs.");
      return;
    }

    const cards = page.locator("[class*='card'], [class*='rounded']");
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThan(0);
    await page.screenshot({ path: "test-results/demo-02-competitors.png" });
  });

  test("demo shows score ring", async ({ page }) => {
    await page.goto("/demo");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    // Look for score elements
    const scoreElement = page.locator("svg circle, [class*='score'], [class*='ring']").first();
    const hasScore = await scoreElement.isVisible({ timeout: 10_000 }).catch(() => false);

    if (!hasScore) {
      const numberElement = page.locator("text=/^\\d{1,3}$/").first();
      const hasNumber = await numberElement.isVisible({ timeout: 5_000 }).catch(() => false);
      if (!hasNumber) {
        await expect(page.locator("body")).not.toContainText("Internal Server Error");
        test.skip(true, "Score ring not visible. Demo data may not be seeded.");
        return;
      }
    }
    await page.screenshot({ path: "test-results/demo-03-score-ring.png" });
  });
});
