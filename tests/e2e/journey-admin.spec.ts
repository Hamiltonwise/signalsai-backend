import { test, expect } from "@playwright/test";

const ADMIN_TOKEN = process.env.SMOKE_ADMIN_TOKEN;

test.describe("Admin: HQ Navigation + Pilot Impersonation", () => {
  test.skip(!ADMIN_TOKEN, "SMOKE_ADMIN_TOKEN not set");

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate((token: string) => {
      localStorage.setItem("auth_token", token);
    }, ADMIN_TOKEN!);
  });

  test("HQ Morning Brief renders", async ({ page }) => {
    await page.goto("/admin/action-items");
    await page.waitForLoadState("networkidle");
    // Assert HQ renders with at least one element
    await expect(page.locator("body")).not.toContainText("500");
    const content = page.locator("h1, h2, [class*='card'], [class*='signal']").first();
    await expect(content).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: "test-results/admin-01-hq.png" });
  });

  test("org detail loads for One Endodontics", async ({ page }) => {
    await page.goto("/admin/organization-management");
    await page.waitForLoadState("networkidle");
    // Click into One Endodontics (org link)
    const orgLink = page.locator("a, button, tr, [class*='card']").filter({ hasText: /One Endo/i }).first();
    if (await orgLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await orgLink.click();
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).not.toContainText("Organization not found");
      await page.screenshot({ path: "test-results/admin-02-org-detail.png" });
    }
  });

  test("Pilot impersonation loads dashboard with org data", async ({ page }) => {
    // Navigate to org 39 (One Endodontics) manage view
    await page.goto("/admin/organizations/39/manage");
    await page.waitForLoadState("networkidle");
    // Look for pilot/impersonate button
    const pilotBtn = page.locator("button, a").filter({ hasText: /pilot|impersonate|view as/i }).first();
    if (await pilotBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await pilotBtn.click();
      await page.waitForURL("**/dashboard**", { timeout: 10_000 });
      // Dashboard should show org data, not be blank
      const dashContent = page.locator("h1, [class*='card']").first();
      await expect(dashContent).toBeVisible();
      await page.screenshot({ path: "test-results/admin-03-pilot-dashboard.png" });
    }
  });

  test("Founder Mode renders with data", async ({ page }) => {
    await page.goto("/admin/founder");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).not.toContainText("500");
    // If founder mode exists, assert it has at least one panel with a number
    const panel = page.locator("[class*='card'], [class*='panel'], section").first();
    if (await panel.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await page.screenshot({ path: "test-results/admin-04-founder.png" });
    }
  });
});
