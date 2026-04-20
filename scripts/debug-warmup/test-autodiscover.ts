/**
 * Standalone test: verify auto-discover finds dental sub-pages.
 *
 * Scrapes the homepage, parses hrefs with cheerio, applies the same whitelist
 * and dedupe logic as the production auto-discovery step. No warmup side
 * effects.
 */
import * as dotenv from "dotenv";
dotenv.config({ path: "/Users/rustinedave/Desktop/alloro/.env" });

import * as cheerio from "cheerio";
import {
  scrapeUrlWithEscalation,
  normalizeScrapeUrl,
} from "../../src/controllers/admin-websites/feature-services/service.url-scrape-strategies";

const WHITELIST = [
  /^\/meet-dr-/i,
  /^\/dr-/i,
  /^\/doctor/i,
  /^\/our-team/i,
  /^\/our-doctors/i,
  /^\/team/i,
  /^\/services/i,
  /^\/treatments/i,
  /^\/procedures/i,
  /^\/about/i,
  /^\/our-practice/i,
  /^\/our-story/i,
];

const FILE_EXT = /\.(pdf|docx?|jpe?g|png|gif|mp4|zip|svg|ico)($|\?)/i;

function matchesWhitelist(pathname: string): boolean {
  return WHITELIST.some((rx) => rx.test(pathname));
}

async function main() {
  const url = process.argv[2] || "https://www.coastalendostudio.com/";
  console.log(`Scraping ${url} for auto-discovery test\n`);

  const result = await scrapeUrlWithEscalation(url, "browser");
  const html = String(Object.values(result.pages)[0] || "");
  console.log(`Got ${html.length} chars of raw HTML\n`);

  const base = new URL(url);
  const $ = cheerio.load(html);

  const allLinks = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const abs = new URL(href, url);
      if (abs.hostname !== base.hostname) return;
      if (FILE_EXT.test(abs.pathname)) return;
      if (abs.search.includes("download=")) return;
      if (abs.href.length > 200) return;
      const normalized = normalizeScrapeUrl(abs.href).primary;
      allLinks.add(normalized);
    } catch {
      // skip
    }
  });

  console.log(`${allLinks.size} total same-origin links after extension/size filtering\n`);

  const matched: string[] = [];
  const rejected: string[] = [];
  for (const link of allLinks) {
    const path = new URL(link).pathname;
    if (matchesWhitelist(path)) matched.push(link);
    else rejected.push(link);
  }

  console.log(`Whitelist matches (${matched.length}):`);
  for (const m of matched) console.log(`  ✓ ${m}`);
  console.log(`\nRejected (first 10 of ${rejected.length}):`);
  for (const r of rejected.slice(0, 10)) console.log(`    ${r}`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
