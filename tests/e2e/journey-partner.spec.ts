import { test, expect } from "@playwright/test";

test.describe("Partner: Portfolio View", () => {
  test("partner portal renders without infinite loading", async ({ page }) => {
    // Try to login as partner user
    const res = await page.request.post("/api/auth/login", {
      data: {
        email: "merideth@dentalemr.com",
        password: process.env.PARTNER_TEST_PASSWORD || "TestPartner123!",
      },
    });

    if (!res.ok()) {
      test.skip(true, "Partner account not seeded or credentials invalid");
      return;
    }

    const data = await res.json();
    if (!data.token) {
      test.skip(true, "Partner login did not return token");
      return;
    }

    await page.goto("/");
    await page.evaluate((token: string) => {
      localStorage.setItem("auth_token", token);
    }, data.token);

    await page.goto("/partner");
    await page.waitForLoadState("networkidle");

    // Assert no 500 error
    await expect(page.locator("body")).not.toContainText("500");
    await expect(page.locator("body")).not.toContainText("Internal Server Error");

    // Assert no infinite loading skeleton (wait 5s, then check)
    await page.waitForTimeout(5_000);
    const skeletons = page.locator("[class*='skeleton'], [class*='animate-pulse']");
    const skeletonCount = await skeletons.count();
    // Some skeletons are fine, but the whole page shouldn't be skeleton
    expect(skeletonCount).toBeLessThan(10);
    await page.screenshot({ path: "test-results/partner-01-portfolio.png" });
  });
});
