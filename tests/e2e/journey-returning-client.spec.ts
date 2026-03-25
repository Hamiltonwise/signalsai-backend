import { test, expect } from "@playwright/test";

test.describe("Returning Client: Dashboard Navigation", () => {
  test.beforeEach(async ({ page }) => {
    // Login via demo endpoint
    const res = await page.request.get("/api/demo/login");
    const data = await res.json();
    expect(data.success).toBeTruthy();
    // Set token in localStorage before navigating
    await page.goto("/");
    await page.evaluate((token: string) => {
      localStorage.setItem("auth_token", token);
    }, data.token);
  });

  test("dashboard shows practice health data", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    // Assert greeting or practice name visible
    await expect(page.locator("h1").first()).toBeVisible();
    // Assert at least one card renders (not blank)
    const card = page.locator("[class*='rounded'], [class*='card'], [class*='border']").first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: "test-results/returning-01-dashboard.png" });
  });

  test("rankings page renders competitor data", async ({ page }) => {
    await page.goto("/dashboard/rankings");
    await page.waitForLoadState("networkidle");
    // Page should render without error
    await expect(page.locator("body")).not.toContainText("500");
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
    await page.screenshot({ path: "test-results/returning-02-rankings.png" });
  });

  test("referrals page renders", async ({ page }) => {
    await page.goto("/dashboard/referrals");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).not.toContainText("500");
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
    await page.screenshot({ path: "test-results/returning-03-referrals.png" });
  });

  test("website page renders", async ({ page }) => {
    await page.goto("/dashboard/website");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).not.toContainText("500");
    await page.screenshot({ path: "test-results/returning-04-website.png" });
  });

  test("progress page renders", async ({ page }) => {
    await page.goto("/dashboard/progress");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).not.toContainText("500");
    await page.screenshot({ path: "test-results/returning-05-progress.png" });
  });

  test("reviews page renders", async ({ page }) => {
    await page.goto("/dashboard/reviews");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).not.toContainText("500");
    await page.screenshot({ path: "test-results/returning-06-reviews.png" });
  });
});
