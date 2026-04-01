import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const BASE = "https://sandbox.getalloro.com";
const SCREENSHOT_DIR = "/tmp/alloro-screenshots";

// Ensure directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

interface UserConfig {
  name: string;
  email: string;
  password: string;
  isAdmin: boolean;
}

const users: UserConfig[] = [
  { name: "corey", email: "corey@getalloro.com", password: "alloro2026", isAdmin: true },
  { name: "dave", email: "dave@getalloro.com", password: "alloro2026", isAdmin: true },
  { name: "jordan", email: "jordan@getalloro.com", password: "alloro2026", isAdmin: true },
  { name: "demo", email: "demo@getalloro.com", password: "demo2026", isAdmin: false },
];

// Pages to screenshot for each user type
const adminPages = [
  { name: "hq-command-center", route: "/admin/action-items" },
  { name: "hq-organizations", route: "/admin/organization-management" },
  { name: "hq-dream-team", route: "/admin/minds" },
  { name: "hq-agent-outputs", route: "/admin/agent-outputs" },
  { name: "hq-live-feed", route: "/admin/live-feed" },
  { name: "hq-revenue", route: "/admin/revenue" },
  { name: "hq-practice-ranking", route: "/admin/practice-ranking" },
  { name: "hq-websites", route: "/admin/websites" },
  { name: "hq-batch-checkup", route: "/admin/batch-checkup" },
  { name: "hq-settings", route: "/admin/settings" },
  { name: "hq-app-logs", route: "/admin/app-logs" },
  { name: "hq-schedules", route: "/admin/schedules" },
  { name: "hq-templates", route: "/admin/templates" },
  { name: "hq-case-studies", route: "/admin/case-studies" },
  { name: "hq-ai-data-insights", route: "/admin/ai-data-insights" },
  { name: "hq-ai-pms-automation", route: "/admin/ai-pms-automation" },
];

const customerPages = [
  { name: "dashboard", route: "/dashboard" },
  { name: "dashboard-rankings", route: "/dashboard/rankings" },
  { name: "dashboard-referrals", route: "/dashboard/referrals" },
  { name: "dashboard-progress", route: "/dashboard/progress" },
  { name: "dashboard-reviews", route: "/dashboard/reviews" },
  { name: "dashboard-intelligence", route: "/dashboard/intelligence" },
  { name: "dashboard-website", route: "/dashboard/website" },
  { name: "dashboard-settings", route: "/dashboard/settings" },
  { name: "tasks", route: "/tasks" },
  { name: "settings-billing", route: "/settings/billing" },
  { name: "settings-integrations", route: "/settings/integrations" },
  { name: "settings-users", route: "/settings/users" },
  { name: "settings-account", route: "/settings/account" },
];

const publicPages = [
  { name: "marketing-home", route: "/" },
  { name: "checkup-entry", route: "/checkup" },
  { name: "pricing", route: "/pricing" },
  { name: "signin", route: "/signin" },
  { name: "signup", route: "/signup" },
  { name: "product", route: "/product" },
  { name: "how-it-works", route: "/how-it-works" },
  { name: "who-its-for", route: "/who-its-for" },
  { name: "about", route: "/about" },
  { name: "story", route: "/story" },
  { name: "foundation", route: "/foundation" },
  { name: "terms", route: "/terms" },
  { name: "privacy", route: "/privacy" },
  { name: "demo", route: "/demo" },
  { name: "business-clarity", route: "/business-clarity" },
];

async function loginAndGetToken(request: APIRequestContext, email: string, password: string): Promise<{ token: string; user: any } | null> {
  try {
    const res = await request.post(`${BASE}/api/auth/login`, {
      data: { email, password },
      timeout: 15000,
    });
    if (!res.ok()) {
      console.error(`Login failed for ${email}: ${res.status()} ${await res.text()}`);
      return null;
    }
    const data = await res.json();
    if (data.success && data.token) {
      return { token: data.token, user: data.user };
    }
    console.error(`Login response missing token for ${email}:`, data);
    return null;
  } catch (e) {
    console.error(`Login error for ${email}:`, e);
    return null;
  }
}

async function screenshotPage(
  page: Page,
  userName: string,
  pageName: string,
  route: string,
  token: string | null,
  user: any | null,
) {
  await page.setViewportSize({ width: 1280, height: 900 });

  // Navigate to base first to set localStorage
  await page.goto(BASE, { waitUntil: "commit", timeout: 20000 });

  if (token && user) {
    await page.evaluate(
      ({ t, u }: { t: string; u: any }) => {
        localStorage.setItem("auth_token", t);
        sessionStorage.setItem("auth_token", t);
        sessionStorage.setItem("token", t);
        if (u.email) localStorage.setItem("user_email", u.email);
        if (u.organizationId) {
          localStorage.setItem("organizationId", String(u.organizationId));
          sessionStorage.setItem("organizationId", String(u.organizationId));
        }
        if (u.role) {
          localStorage.setItem("user_role", u.role);
          sessionStorage.setItem("user_role", u.role);
        }
      },
      { t: token, u: user },
    );
  }

  // Navigate to the target page
  const fullUrl = `${BASE}${route}`;
  await page.goto(fullUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

  // Wait for content to load
  await page.waitForTimeout(3000);

  // Wait for spinners to finish
  try {
    await page.waitForFunction(
      () => {
        const spinner = document.querySelector('.animate-spin:not([class*="skeleton"])');
        return !spinner;
      },
      { timeout: 8000 },
    );
  } catch {
    // timeout is fine, take screenshot anyway
  }

  await page.waitForTimeout(500);

  const filePath = path.join(SCREENSHOT_DIR, `${userName}--${pageName}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

// Public pages (no auth needed)
test.describe("public-pages", () => {
  for (const pg of publicPages) {
    test(`public--${pg.name}`, async ({ page }) => {
      const filePath = await screenshotPage(page, "public", pg.name, pg.route, null, null);
      expect(fs.existsSync(filePath)).toBe(true);
    });
  }
});

// Per-user authenticated pages
for (const user of users) {
  test.describe(`${user.name}-pages`, () => {
    let token: string | null = null;
    let userData: any = null;

    test.beforeAll(async ({ request }) => {
      const result = await loginAndGetToken(request, user.email, user.password);
      if (result) {
        token = result.token;
        userData = result.user;
      }
    });

    // Admin pages for admin users
    if (user.isAdmin) {
      for (const pg of adminPages) {
        test(`${user.name}--${pg.name}`, async ({ page }) => {
          if (!token) {
            test.skip(true, `Login failed for ${user.email}`);
            return;
          }
          const filePath = await screenshotPage(page, user.name, pg.name, pg.route, token, userData);
          expect(fs.existsSync(filePath)).toBe(true);
        });
      }
    }

    // Customer/dashboard pages for all users
    for (const pg of customerPages) {
      test(`${user.name}--${pg.name}`, async ({ page }) => {
        if (!token) {
          test.skip(true, `Login failed for ${user.email}`);
          return;
        }
        const filePath = await screenshotPage(page, user.name, pg.name, pg.route, token, userData);
        expect(fs.existsSync(filePath)).toBe(true);
      });
    }
  });
}
