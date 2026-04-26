/**
 * One-off admin audit script — generates a complete audit row for a site
 * the regular pipeline can't scrape (Cloudflare-blocked, etc.) by running
 * headed Playwright + stealth so a real visible Chrome window can settle
 * any JS challenge before we capture HTML + screenshot.
 *
 * USE CASE
 *   Client demo where audit.getalloro.com/?audit_id=… needs to render a
 *   full report (screenshots, website analysis, GBP analysis) for a
 *   bot-protected site.
 *
 * USAGE
 *   cd ~/Desktop/alloro
 *
 *   # Default — headed Playwright launches a visible Chrome window:
 *   npx tsx scripts/admin-audit.ts \
 *     --domain="https://coastalendostudio.com" \
 *     --practice="Coastal Endodontic Studio San Luis Obispo CA"
 *
 *   # Or supply a manually-captured HTML + screenshot (skip Playwright):
 *   npx tsx scripts/admin-audit.ts \
 *     --domain="https://coastalendostudio.com" \
 *     --practice="Coastal Endodontic Studio San Luis Obispo CA" \
 *     --html=/tmp/coastal.html \
 *     --screenshot=/tmp/coastal.jpg
 *
 * RUNS AGAINST whichever DB the .env points to (currently sandbox RDS).
 * Output URL: http://localhost:3002/?audit_id=<uuid> (local frontend)
 *             https://audit.getalloro.com/?audit_id=<uuid> (only works
 *             if prod can read this row — sandbox RDS rows are NOT
 *             visible from prod).
 */

import { v4 as uuidv4 } from "uuid";
import sharp from "sharp";
import * as fs from "fs";
import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser } from "playwright";

import { AuditProcessModel } from "../src/models/AuditProcessModel";
import { updateAuditFields } from "../src/controllers/audit/audit-services/auditUpdateService";
import { uploadAuditScreenshot } from "../src/controllers/audit/audit-services/service.audit-s3";
import {
  scrapeSelfGBP,
  scrapeCompetitorGBPs,
} from "../src/controllers/audit/audit-services/service.audit-apify";
import { runAgent } from "../src/agents/service.llm-runner";
import { loadPrompt } from "../src/agents/service.prompt-loader";
import { stripMarkupForLLM } from "../src/controllers/audit/audit-utils/markupStripper";
import {
  condenseGbp,
  condenseCompetitors,
} from "../src/controllers/audit/audit-utils/payloadCondensers";
import {
  aggregateGbpAnalysis,
  type PillarBundle,
  type ProfileIntegrityResult,
  type CompetitorAnalysisResult,
  type PillarOnlyResult,
} from "../src/controllers/audit/audit-utils/gbpAnalysisAggregator";

chromium.use(StealthPlugin());

const AUDIT_MODEL = process.env.AUDIT_LLM_MODEL || "claude-haiku-4-5-20251001";
const CLAUDE_MAX_DIMENSION = parseInt(
  process.env.CLAUDE_MAX_DIMENSION || "1024",
  10
);
const COMPETITOR_LIMIT = parseInt(
  process.env.AUDIT_COMPETITOR_LIMIT || "5",
  10
);

// Long enough for a CF JS challenge to resolve in a real (visible) browser.
// Stealth alone often beats CF in 5-15s; a stubborn one might take 30-60s.
const HEADED_NAV_TIMEOUT_MS = 120_000;
// After domcontentloaded fires, give the page extra time to render content
// (CF challenge → real-page transition + lazy-loaded above-the-fold images).
const POST_LOAD_SETTLE_MS = 8_000;

const log = (msg: string) => console.log(`[ADMIN-AUDIT] ${msg}`);

interface CliArgs {
  domain: string;
  practice: string;
  html?: string;
  screenshot?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: Partial<CliArgs> = {};
  for (const a of argv) {
    const m = a.match(/^--([a-zA-Z]+)=(.*)$/);
    if (!m) continue;
    const [, k, v] = m;
    if (k === "domain") args.domain = v;
    else if (k === "practice") args.practice = v;
    else if (k === "html") args.html = v;
    else if (k === "screenshot") args.screenshot = v;
  }
  if (!args.domain || !args.practice) {
    throw new Error(
      "missing required args. Use --domain=https://... --practice='...'"
    );
  }
  return args as CliArgs;
}

async function captureHeaded(domain: string): Promise<{
  html: string;
  screenshotBase64: string;
  finalUrl: string;
  loadTime: number;
}> {
  log(`Launching HEADED Chrome (stealth) for ${domain}`);
  log(
    `A visible browser window will open. Wait for the page to load fully —` +
      ` if Cloudflare shows a challenge, let it resolve. The script auto-` +
      `captures ${POST_LOAD_SETTLE_MS}ms after DOM is ready.`
  );

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: false, args: ["--no-sandbox"] });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();
    const t0 = Date.now();
    await page.goto(domain, {
      waitUntil: "domcontentloaded",
      timeout: HEADED_NAV_TIMEOUT_MS,
    });
    const loadTime = Date.now() - t0;
    log(`✓ DOM loaded in ${loadTime}ms — settling for ${POST_LOAD_SETTLE_MS}ms`);
    await page.waitForTimeout(POST_LOAD_SETTLE_MS);

    const finalUrl = page.url();
    const html = await page.content();
    const screenshotBuf = await page.screenshot({
      type: "jpeg",
      quality: 70,
      fullPage: true,
    });
    log(
      `✓ captured: html=${Math.round(html.length / 1024)}kB ` +
        `screenshot=${Math.round(screenshotBuf.length / 1024)}kB ` +
        `finalUrl=${finalUrl}`
    );
    return {
      html,
      screenshotBase64: screenshotBuf.toString("base64"),
      finalUrl,
      loadTime,
    };
  } finally {
    if (browser) await browser.close();
  }
}

function captureFromFiles(
  htmlPath: string,
  screenshotPath: string,
  domain: string
): { html: string; screenshotBase64: string; finalUrl: string; loadTime: number } {
  log(`Reading HTML from ${htmlPath} and screenshot from ${screenshotPath}`);
  const html = fs.readFileSync(htmlPath, "utf-8");
  const screenshotBuf = fs.readFileSync(screenshotPath);
  log(
    `✓ loaded: html=${Math.round(html.length / 1024)}kB ` +
      `screenshot=${Math.round(screenshotBuf.length / 1024)}kB`
  );
  return {
    html,
    screenshotBase64: screenshotBuf.toString("base64"),
    finalUrl: domain,
    loadTime: 0,
  };
}

async function resizeForClaude(
  base64: string
): Promise<{ base64: string; sizeKB: number }> {
  const buffer = Buffer.from(base64, "base64");
  const resized = await sharp(buffer)
    .resize(CLAUDE_MAX_DIMENSION, CLAUDE_MAX_DIMENSION, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer();
  return {
    base64: resized.toString("base64"),
    sizeKB: Math.round(resized.length / 1024),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const auditId = uuidv4();
  const t0 = Date.now();

  log(`audit_id = ${auditId}`);
  log(`domain   = ${args.domain}`);
  log(`practice = ${args.practice}`);

  // 1. Insert pending row
  await AuditProcessModel.create({
    id: auditId,
    domain: args.domain,
    practice_search_string: args.practice,
    status: "processing",
    realtime_status: 0,
  });
  log(`✓ row inserted (status=processing, realtime_status=0)`);

  // 2. Capture homepage
  const captured =
    args.html && args.screenshot
      ? captureFromFiles(args.html, args.screenshot, args.domain)
      : await captureHeaded(args.domain);

  // 3. Strip + upload screenshot
  const stripped = stripMarkupForLLM(captured.html);
  log(
    `✓ stripMarkup: ${stripped.originalSizeKB}kB → ${stripped.strippedSizeKB}kB ` +
      `(-${stripped.reductionPct}%)`
  );

  const desktopUrl = await uploadAuditScreenshot(
    auditId,
    "desktop",
    captured.screenshotBase64
  );
  await updateAuditFields(auditId, {
    step_screenshots: { desktop_url: desktopUrl, mobile_url: null },
    realtime_status: 1,
  });
  log(`✓ screenshot uploaded → ${desktopUrl}`);

  // 4. Branch B: WebsiteAnalysis (Claude vision)
  log(`▶ [B] WebsiteAnalysis Claude call`);
  const desktopResized = await resizeForClaude(captured.screenshotBase64);
  log(`  resized desktop=${desktopResized.sizeKB}kB`);
  const waSystem = loadPrompt("auditAgents/WebsiteAnalysis");
  const waUserMessage = [
    "HTML Markup (semantically stripped — scripts/styles/SVG bodies/data URLs removed):",
    stripped.html,
    "",
    "Telemetry:",
    JSON.stringify({
      isSecure: captured.finalUrl.startsWith("https://"),
      loadTime: captured.loadTime,
      brokenLinks: [],
    }),
  ].join("\n");
  const waResult = await runAgent({
    systemPrompt: waSystem,
    userMessage: waUserMessage,
    model: AUDIT_MODEL,
    images: [{ mediaType: "image/jpeg", base64: desktopResized.base64 }],
  });
  if (!waResult.parsed) {
    throw new Error(
      `WebsiteAnalysis unparseable (first 200ch: ${waResult.raw.slice(0, 200)})`
    );
  }
  await updateAuditFields(auditId, {
    step_website_analysis: waResult.parsed,
    realtime_status: 2,
  });
  log(
    `✓ [B] complete tokens=${waResult.inputTokens}/${waResult.outputTokens} → realtime_status=2`
  );

  // 5. Branch C1: CompetitorStringBuilder
  log(`▶ [C1] CompetitorStringBuilder`);
  const csbResult = await runAgent({
    systemPrompt: loadPrompt("auditAgents/CompetitorStringBuilder"),
    userMessage: [
      `practice_search_string: ${args.practice}`,
      `gbp_address: (unknown — GBP not yet scraped; infer from practice_search_string)`,
    ].join("\n"),
    model: AUDIT_MODEL,
  });
  if (!csbResult.parsed) {
    throw new Error("CompetitorStringBuilder unparseable");
  }
  const { competitor_string: competitorString, self_compact_string: selfCompactString } =
    csbResult.parsed as {
      competitor_string?: string;
      self_compact_string?: string;
    };
  if (!competitorString || !selfCompactString) {
    throw new Error("CompetitorStringBuilder missing competitor_string or self_compact_string");
  }
  log(`✓ [C1] competitor="${competitorString}" self="${selfCompactString}"`);

  // 6. Branch C2 + C3 in parallel
  log(`▶ [C2+C3] scrapeSelfGBP + scrapeCompetitorGBPs (parallel)`);
  const [gbpMinimized, competitorsArr] = await Promise.all([
    scrapeSelfGBP(selfCompactString),
    scrapeCompetitorGBPs(competitorString, COMPETITOR_LIMIT),
  ]);
  await updateAuditFields(auditId, {
    step_self_gbp: gbpMinimized,
    step_competitors: { competitors: competitorsArr },
    realtime_status: 4,
  });
  log(
    `✓ [C2] self GBP scraped title="${(gbpMinimized as Record<string, unknown>).title}"`
  );
  log(`✓ [C3] ${competitorsArr.length} competitor(s) scraped → realtime_status=4`);

  // 7. GBPAnalysis (5 pillars in parallel + aggregator)
  log(`▶ GBPAnalysis (5 pillars + aggregator)`);
  const condensedClient = condenseGbp(gbpMinimized);
  const condensedCompetitors = condenseCompetitors(competitorsArr);

  const piMsg = [
    "client_gbp:",
    JSON.stringify({
      title: condensedClient.title,
      address: condensedClient.address,
      phone: condensedClient.phone,
      website: condensedClient.website,
    }),
    "",
    "site_markup (semantically stripped):",
    stripped.html,
  ].join("\n");

  const teMsg = [
    "client_gbp:",
    JSON.stringify({
      averageStarRating: condensedClient.averageStarRating,
      reviewsCount: condensedClient.reviewsCount,
      reviewsDistribution: condensedClient.reviewsDistribution,
      reviewsLast30d: condensedClient.reviewsLast30d,
      reviewsLast90d: condensedClient.reviewsLast90d,
    }),
    "",
    "competitors:",
    JSON.stringify(
      condensedCompetitors.map((c) => ({
        title: c.title,
        averageStarRating: c.averageStarRating,
        reviewsCount: c.reviewsCount,
        reviewsLast30d: c.reviewsLast30d,
        reviewsLast90d: c.reviewsLast90d,
      }))
    ),
  ].join("\n");

  const vaMsg = [
    "client_gbp:",
    JSON.stringify({
      imagesCount: condensedClient.imagesCount,
      imageCategories: condensedClient.imageCategories,
    }),
    "",
    "competitors:",
    JSON.stringify(
      condensedCompetitors.map((c) => ({
        title: c.title,
        imagesCount: c.imagesCount,
        imageCategories: c.imageCategories,
      }))
    ),
  ].join("\n");

  const scMsg = [
    "client_gbp:",
    JSON.stringify({
      title: condensedClient.title,
      categoryName: condensedClient.categoryName,
      categories: condensedClient.categories,
      address: condensedClient.address,
      hasWebsite: condensedClient.hasWebsite,
      hasPhone: condensedClient.hasPhone,
      hasHours: condensedClient.hasHours,
      openingHoursSummary: condensedClient.openingHoursSummary,
    }),
  ].join("\n");

  const caMsg = [
    "client_gbp:",
    JSON.stringify(condensedClient),
    "",
    "competitors:",
    JSON.stringify(condensedCompetitors),
  ].join("\n");

  const callPillar = async <T>(promptPath: string, userMessage: string, label: string): Promise<T> => {
    const res = await runAgent({
      systemPrompt: loadPrompt(promptPath),
      userMessage,
      model: AUDIT_MODEL,
    });
    if (!res.parsed) {
      throw new Error(`${label} unparseable (first 200ch: ${res.raw.slice(0, 200)})`);
    }
    return res.parsed as T;
  };

  const [
    profileIntegrity,
    trustEngagement,
    visualAuthority,
    searchConversion,
    competitorAnalysis,
  ] = await Promise.all([
    callPillar<ProfileIntegrityResult>(
      "auditAgents/gbp/ProfileIntegrity",
      piMsg,
      "ProfileIntegrity"
    ),
    callPillar<PillarOnlyResult>(
      "auditAgents/gbp/TrustEngagement",
      teMsg,
      "TrustEngagement"
    ),
    callPillar<PillarOnlyResult>(
      "auditAgents/gbp/VisualAuthority",
      vaMsg,
      "VisualAuthority"
    ),
    callPillar<PillarOnlyResult>(
      "auditAgents/gbp/SearchConversion",
      scMsg,
      "SearchConversion"
    ),
    callPillar<CompetitorAnalysisResult>(
      "auditAgents/gbp/CompetitorAnalysis",
      caMsg,
      "CompetitorAnalysis"
    ),
  ]);

  const bundle: PillarBundle = {
    profileIntegrity,
    trustEngagement,
    visualAuthority,
    searchConversion,
    competitorAnalysis,
  };
  const gbpAnalysis = aggregateGbpAnalysis(bundle);

  await updateAuditFields(auditId, {
    step_gbp_analysis: gbpAnalysis,
    realtime_status: 5,
    status: "completed",
  });
  log(
    `✓ GBPAnalysis complete score=${gbpAnalysis.gbp_readiness_score} grade=${gbpAnalysis.gbp_grade}`
  );

  const totalMs = Date.now() - t0;
  log("");
  log("====================================================================");
  log("🎉 AUDIT COMPLETE");
  log("====================================================================");
  log(`  audit_id     : ${auditId}`);
  log(`  total time   : ${(totalMs / 1000).toFixed(1)}s`);
  log(`  GBP grade    : ${gbpAnalysis.gbp_grade} / ${gbpAnalysis.gbp_readiness_score}`);
  log(`  view locally : http://localhost:3002/?audit_id=${auditId}`);
  log(
    `  view (prod)  : https://audit.getalloro.com/?audit_id=${auditId}` +
      ` (only if API points at the same DB this script wrote to)`
  );
  log("====================================================================");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[ADMIN-AUDIT] ✗ FAILED:", err?.message || err);
    if (err?.stack) console.error(err.stack);
    process.exit(1);
  });
