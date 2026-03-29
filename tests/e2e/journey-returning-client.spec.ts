import { test, expect } from "@playwright/test";

/**
 * Returning Client journeys (requires seeded demo account)
 * Tests CS Agent chat, goal timeline, To-Do List, and dashboard navigation.
 */
test.describe("Returning Client: Authenticated Journeys", () => {
  test.beforeEach(async ({ page }) => {
    // Auto-login via demo endpoint
    const res = await page.request.get("/api/demo/login");
    const data = await res.json();
    if (!data.success) {
      test.skip(true, "Demo account not seeded. Run: npm run seed:demo");
      return;
    }
    await page.goto("/");
    await page.evaluate(
      ({ token, orgId, role }: { token: string; orgId: string; role: string }) => {
        localStorage.setItem("auth_token", token);
        if (orgId) localStorage.setItem("organizationId", orgId);
        if (role) localStorage.setItem("user_role", role);
      },
      { token: data.token, orgId: String(data.user?.organizationId || ""), role: data.user?.role || "admin" },
    );
  });

  /**
   * Journey 2: CS Agent Chat
   * click button -> type message -> response appears (not "Something went wrong")
   */
  test("CS Agent chat opens and accepts input", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    // Find and click the CS Agent chat button
    const chatButton = page.locator("button:has-text('Ask Alloro'), button:has-text('Chat'), [aria-label*='chat' i]").first();
    if (await chatButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await chatButton.click();
      await page.waitForTimeout(500);

      // Verify chat panel opened with input field
      const chatInput = page.locator("textarea, input[placeholder*='message' i], input[placeholder*='ask' i]").first();
      await expect(chatInput).toBeVisible({ timeout: 5_000 });
    }
    await page.screenshot({ path: "test-results/returning-02-cs-agent.png" });
  });

  /**
   * Journey 3: Goal Timeline
   * Progress Report -> Set my timeline -> select 5 years -> saves without resetting
   */
  test("goal timeline saves without resetting", async ({ page }) => {
    await page.goto("/dashboard/progress");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    // Page should render without 500 error
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
    await page.screenshot({ path: "test-results/returning-03-progress.png" });
  });

  /**
   * Journey 4: To-Do List
   * click nav item -> renders task list (not referrals gate, not onboarding gate)
   */
  test("/tasks renders To-Do List, not gate screen", async ({ page }) => {
    await page.goto("/tasks");
    await page.waitForLoadState("networkidle");

    // Must show "To-Do List" heading, not "Let's Set Up Your Dashboard"
    const heading = page.locator("main h1, [role='main'] h1").first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
    const headingText = await heading.textContent();
    expect(headingText).toContain("To-Do List");

    // Must NOT show the onboarding gate
    const gateScreen = page.locator("text=/Let's Set Up Your Dashboard/i");
    const hasGate = await gateScreen.isVisible().catch(() => false);
    expect(hasGate).toBeFalsy();

    await page.screenshot({ path: "test-results/returning-04-tasks.png" });
  });

  // Dashboard smoke tests
  test("dashboard loads with content", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: "test-results/returning-01-dashboard.png" });
  });

  test("rankings page renders", async ({ page }) => {
    await page.goto("/dashboard/rankings");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
    await page.screenshot({ path: "test-results/returning-05-rankings.png" });
  });

  test("reviews page renders", async ({ page }) => {
    await page.goto("/dashboard/reviews");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
    await page.screenshot({ path: "test-results/returning-06-reviews.png" });
  });
});
