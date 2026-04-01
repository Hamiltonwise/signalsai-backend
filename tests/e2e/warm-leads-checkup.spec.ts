/**
 * Warm Leads Checkup Test -- The Real 10 People
 *
 * These are actual prospects Corey will send the link to.
 * If the checkup breaks for ANY of them, fix it before they click.
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const BASE = "https://sandbox.getalloro.com";
const DIR = "/tmp/alloro-warm-leads";
const IPHONE = { width: 390, height: 844 };

if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

const LEADS = [
  "Artful Orthodontics",
  "Caswell Orthodontics",
  "Garrison Orthodontics",
  "One Endodontics",
  "San Diego Center for Endodontics",
  "Surf City Endo",
  "DentalEMR",
  "Ray's Place Barbershop",
  "Evergreen Oculofacial Plastic Surgery",
  "Grove & Kane Med Spa",
];

for (const lead of LEADS) {
  test(`Checkup: ${lead}`, async ({ page }) => {
    await page.setViewportSize(IPHONE);
    await page.goto(`${BASE}/checkup?mode=conference`, {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });
    await page.waitForTimeout(1500);

    // Type business name
    const input = page.locator('input[placeholder*="business"], input[placeholder*="name"], input[placeholder*="Search"]').first();
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill(lead);
    await page.waitForTimeout(3000);

    // Screenshot autocomplete results
    const slug = lead.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    await page.screenshot({
      path: path.join(DIR, `${slug}-autocomplete.png`),
      fullPage: true,
    });

    // Check if any suggestions appeared
    const pageText = await page.locator("body").textContent();
    const hasResults = pageText && (
      pageText.includes("Drive") ||
      pageText.includes("Street") ||
      pageText.includes("Avenue") ||
      pageText.includes("Road") ||
      pageText.includes("Blvd") ||
      pageText.includes("Suite") ||
      pageText.includes("Way") ||
      pageText.includes(",")
    );

    // Try clicking first result if available
    const firstResult = page.locator('[class*="suggestion"], [class*="autocomplete"] >> nth=0, [role="option"] >> nth=0').first();
    const resultVisible = await firstResult.isVisible().catch(() => false);

    if (resultVisible) {
      await firstResult.click();
      await page.waitForTimeout(5000);
      await page.screenshot({
        path: path.join(DIR, `${slug}-after-select.png`),
        fullPage: true,
      });
    } else {
      // Try clicking any suggestion-like element
      const anyClickable = page.locator('div[class*="cursor-pointer"], li[class*="cursor-pointer"]').first();
      const clickable = await anyClickable.isVisible().catch(() => false);
      if (clickable) {
        await anyClickable.click();
        await page.waitForTimeout(5000);
        await page.screenshot({
          path: path.join(DIR, `${slug}-after-select.png`),
          fullPage: true,
        });
      }
    }

    // Verify no errors on page
    const errorText = await page.locator("body").textContent();
    expect(errorText).not.toContain("Internal Server Error");
    expect(errorText).not.toContain("Cannot GET");
    expect(errorText).not.toContain("undefined");
  });
}
