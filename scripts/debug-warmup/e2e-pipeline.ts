/**
 * Full warmup pipeline debug harness.
 *
 * Runs every stage end-to-end on a real project, writes each stage's output
 * to /tmp/warmup-debug/stage-N.json so we can inspect each hop and diagnose
 * exactly where data quality falls off.
 *
 * Stages:
 *   1. GBP scrape (Apify) for all selected_place_ids
 *   2. Website URL scrape (browser strategy) on discovered pages
 *   3. Archetype classification (Anthropic)
 *   4. Distillation (Anthropic)
 *   5. Image vision analysis on a sample
 */

import * as dotenv from "dotenv";
dotenv.config({ path: "/Users/rustinedave/Desktop/alloro/.env" });

import * as fs from "fs";
import * as path from "path";
import db from "../../src/database/connection";
import { scrapeGbp } from "../../src/controllers/admin-websites/feature-utils/util.gbp-scraper";
import { scrapeUrlWithEscalation } from "../../src/controllers/admin-websites/feature-services/service.url-scrape-strategies";
import { runAgent } from "../../src/agents/service.llm-runner";
import { loadPrompt } from "../../src/agents/service.prompt-loader";

const OUT_DIR = "/tmp/warmup-debug";
fs.mkdirSync(OUT_DIR, { recursive: true });

function save(name: string, data: unknown): string {
  const p = path.join(OUT_DIR, name);
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
  return p;
}

function cleanForClaude(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-zA-Z0-9#]+;/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-zA-Z0-9.,!?'\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SEP = "=".repeat(76);
const SUB = "-".repeat(76);
function header(t: string) { console.log("\n" + SEP + "\n" + t + "\n" + SEP); }
function sub(t: string) { console.log("\n" + SUB + "\n" + t + "\n" + SUB); }

const PROJECT_ID = "99fd9fdc-f53d-4602-8e4a-3c770d739bf5";

async function main() {
  const skipStages = (process.argv[2] || "").split(",").filter(Boolean);
  const runOnly = process.argv[3];

  header(`E2E Warmup Debug — project ${PROJECT_ID}`);

  const project = await db("website_builder.projects")
    .where("id", PROJECT_ID)
    .select("id", "display_name", "selected_place_ids", "primary_place_id")
    .first();

  if (!project) {
    console.error("Project not found");
    process.exit(1);
  }

  const placeIds: string[] = project.selected_place_ids || [];
  console.log(`Project: ${project.display_name}`);
  console.log(`Place IDs (${placeIds.length}): ${placeIds.join(", ")}`);
  console.log(`Primary: ${project.primary_place_id}`);
  console.log(`Output dir: ${OUT_DIR}`);

  // ---------- STAGE 1: GBP scrape ----------
  let gbpResults: Array<{ place_id: string; data: any; imageCount: number; error?: string }> = [];
  if (!skipStages.includes("1") && (!runOnly || runOnly === "1")) {
    header("STAGE 1: GBP scrape (all 4 place_ids)");
    for (const pid of placeIds) {
      sub(`Scraping ${pid}`);
      const t0 = Date.now();
      try {
        const data = await scrapeGbp(pid);
        const ms = Date.now() - t0;
        const imageCount = Array.isArray(data?.imageUrls) ? data.imageUrls.length : 0;
        console.log(`  ${ms}ms | name: ${data?.title || data?.name || "—"}`);
        console.log(`  address: ${data?.address || "—"}`);
        console.log(`  phone: ${data?.phoneUnformatted || data?.phone || "—"}`);
        console.log(`  category: ${data?.categoryName || data?.category || "—"}`);
        console.log(`  rating: ${data?.totalScore || data?.rating || "—"} (${data?.reviewsCount || data?.reviewCount || 0} reviews)`);
        console.log(`  hours: ${data?.openingHours ? "yes" : "NO"} (${Array.isArray(data?.openingHours) ? data.openingHours.length : "?"} entries)`);
        console.log(`  website: ${data?.website || "—"}`);
        console.log(`  imageUrls: ${imageCount}`);
        console.log(`  reviews (detailed): ${Array.isArray(data?.reviews) ? data.reviews.length : 0}`);
        gbpResults.push({ place_id: pid, data, imageCount });
      } catch (err: any) {
        console.error(`  FAILED: ${err?.message}`);
        gbpResults.push({ place_id: pid, data: null, imageCount: 0, error: err?.message });
      }
    }
    save("stage-1-gbp.json", gbpResults);

    sub("Stage 1 Summary");
    const allImageUrls = gbpResults.flatMap((r) => r.data?.imageUrls || []);
    console.log(`  Total unique GBP images across all locations: ${new Set(allImageUrls).size}`);
    console.log(`  Each location has own hours: ${gbpResults.every((r) => !!r.data?.openingHours)}`);
    const uniqueAddresses = new Set(gbpResults.map((r) => r.data?.address).filter(Boolean));
    console.log(`  Unique addresses: ${uniqueAddresses.size} (want ${placeIds.length} — each location should have distinct)`);
    const primaryGbp = gbpResults.find((r) => r.place_id === project.primary_place_id);
    console.log(`  Primary location's website URL: ${primaryGbp?.data?.website || "—"}`);
  } else {
    console.log("Stage 1 skipped — loading from disk");
    try {
      gbpResults = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "stage-1-gbp.json"), "utf8"));
    } catch {
      console.log("  (no cached stage-1 — some downstream stages will fail)");
    }
  }

  // ---------- STAGE 2: Website URL scrape ----------
  const primaryGbp = gbpResults.find((r) => r.place_id === project.primary_place_id);
  const websiteUrl = primaryGbp?.data?.website as string | undefined;

  if (!websiteUrl) {
    console.log("\nNo primary website URL — skipping website scrape stage.");
  } else if (!skipStages.includes("2") && (!runOnly || runOnly === "2")) {
    // Normalize: upgrade http → https; add www if bare domain. Many GBP URLs
    // come back as http://domain.com/ but Puppeteer blocks those with
    // ERR_BLOCKED_BY_CLIENT (HSTS/security policy). This mirrors what a
    // production scraper must do.
    const normalized = (() => {
      const u = new URL(websiteUrl);
      if (u.protocol === "http:") u.protocol = "https:";
      if (!u.hostname.startsWith("www.") && u.hostname.split(".").length === 2) {
        u.hostname = `www.${u.hostname}`;
      }
      return u.toString();
    })();
    if (normalized !== websiteUrl) {
      console.log(`\n  URL normalized: ${websiteUrl} → ${normalized}`);
    }
    header(`STAGE 2: Website scrape — ${normalized}`);
    const base = new URL(normalized).origin;
    const urlsToTry = [
      `${base}/`,
      `${base}/our-practice/`,
      `${base}/contact/`,
      `${base}/meet-dr-jonathan-fu/`,
      `${base}/services/`,
    ];

    const pageResults: Array<{
      url: string;
      strategy_used_final: string;
      pages_keys: string[];
      raw_chars: number;
      cleaned_chars: number;
      images: number;
      cleaned_preview: string;
      error?: string;
    }> = [];

    for (const u of urlsToTry) {
      sub(`Scraping ${u}`);
      try {
        const result = await scrapeUrlWithEscalation(u, "browser");
        const firstPage = Object.values(result.pages)[0] || "";
        const cleaned = cleanForClaude(String(firstPage));
        pageResults.push({
          url: u,
          strategy_used_final: result.strategy_used_final,
          pages_keys: Object.keys(result.pages),
          raw_chars: String(firstPage).length,
          cleaned_chars: cleaned.length,
          images: result.images.length,
          cleaned_preview: cleaned.slice(0, 400),
        });
        console.log(`  strategy: ${result.strategy_used_final} | raw: ${String(firstPage).length} | cleaned: ${cleaned.length} | images: ${result.images.length}`);
        console.log(`  preview: "${cleaned.slice(0, 200)}..."`);
      } catch (err: any) {
        console.error(`  FAILED: ${err?.message}`);
        pageResults.push({
          url: u,
          strategy_used_final: "none",
          pages_keys: [],
          raw_chars: 0,
          cleaned_chars: 0,
          images: 0,
          cleaned_preview: "",
          error: err?.message,
        });
      }
    }

    save("stage-2-urls.json", pageResults);

    sub("Stage 2 Summary");
    const successful = pageResults.filter((r) => r.cleaned_chars > 500);
    console.log(`  Pages with meaningful content: ${successful.length}/${pageResults.length}`);
    console.log(`  Total cleaned content available: ${pageResults.reduce((s, r) => s + r.cleaned_chars, 0).toLocaleString()} chars`);
    console.log(`  Total images captured: ${pageResults.reduce((s, r) => s + r.images, 0)}`);
  }

  // ---------- STAGE 3: Archetype classification ----------
  if (!skipStages.includes("3") && (!runOnly || runOnly === "3")) {
    header("STAGE 3: Archetype classification");
    const pageData = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "stage-2-urls.json"), "utf8"));
    const homepageCleaned = pageData[0]?.cleaned_preview || "";
    const primaryGbpRaw = primaryGbp?.data || {};

    const gbpSummary = `Name: ${primaryGbpRaw.title || primaryGbpRaw.name}
Category: ${primaryGbpRaw.categoryName || primaryGbpRaw.category}
Address: ${primaryGbpRaw.address}
Phone: ${primaryGbpRaw.phoneUnformatted || primaryGbpRaw.phone}
Reviews: ${primaryGbpRaw.reviewsCount || 0} avg ${primaryGbpRaw.totalScore || "?"}
Website: ${primaryGbpRaw.website}`;

    try {
      const prompt = loadPrompt("websiteAgents/builder/ArchetypeClassifier");
      const userMsg = `## GBP Profile\n${gbpSummary}\n\n## Website Excerpt (homepage, cleaned)\n${homepageCleaned}`;

      const t0 = Date.now();
      const result = await runAgent({
        systemPrompt: prompt,
        userMessage: userMsg,
        model: process.env.AGENTS_LLM_MODEL || "claude-sonnet-4-6",
        maxTokens: 1000,
      });
      console.log(`  Elapsed: ${Date.now() - t0}ms`);
      const raw: string = (result as any).raw || "";
      const parsed = (result as any).parsed;
      console.log(`  Raw LLM output:`);
      console.log("  " + raw.replace(/\n/g, "\n  "));
      if (parsed) {
        console.log(`\n  Parsed: archetype=${parsed.archetype} tone=${parsed.tone_descriptor}`);
      }
      save("stage-3-archetype.json", { input: userMsg, raw, parsed });
    } catch (err: any) {
      console.error(`  FAILED: ${err?.message}`);
    }
  }

  // ---------- STAGE 4: Distillation ----------
  if (!skipStages.includes("4") && (!runOnly || runOnly === "4")) {
    header("STAGE 4: Distillation");
    const pageData = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "stage-2-urls.json"), "utf8"));
    const pagesWithContent = pageData.filter((p: any) => p.cleaned_chars > 500);

    // Rebuild a distillation user message similar to the warmup pipeline.
    const parts: string[] = [];
    const discoveredUrls = pagesWithContent.map((p: any) => p.url);
    parts.push(`## DISCOVERED PAGES (use ONLY these exact URLs for doctors[].source_url and services[].source_url)\n\n${discoveredUrls.map((u: string) => `- ${u}`).join("\n")}`);

    // T4: LOCATIONS block — matches production distillContent format.
    if (gbpResults && gbpResults.length > 0) {
      const locBlock = gbpResults
        .filter((r: any) => r?.data)
        .map((r: any) => `- ${r.place_id} — ${r.data.title || r.data.name} — ${r.data.address}`)
        .join("\n");
      if (locBlock) {
        parts.push(`## LOCATIONS (use these place_ids for doctors[].location_place_ids when the doctor is explicitly tied to an office)\n\n${locBlock}`);
      }
    }

    // Stage 2 only saved previews. Re-scrape to get full cleaned content for distillation.
    sub("Re-scraping pages for full distillation input");
    const fullPagesText: string[] = [];
    for (const p of pagesWithContent) {
      try {
        const result = await scrapeUrlWithEscalation(p.url, "browser");
        const raw = String(Object.values(result.pages)[0] || "");
        const cleaned = cleanForClaude(raw).slice(0, 15000);
        fullPagesText.push(`### ${p.url}\n${cleaned}`);
        console.log(`  ${p.url} → ${cleaned.length} chars`);
      } catch (err: any) {
        console.error(`  ${p.url} FAILED: ${err?.message}`);
      }
    }
    parts.push(`## Website Content\n\n${fullPagesText.join("\n\n")}`);

    const primaryReviews = Array.isArray(primaryGbp?.data?.reviews) ? primaryGbp.data.reviews.slice(0, 10) : [];
    if (primaryReviews.length > 0) {
      parts.push(
        `## GBP Reviews\n\n${primaryReviews
          .map((r: any) => `- ${r.name || "Anonymous"} (${r.stars || r.rating}⭐): ${(r.text || "").slice(0, 500)}`)
          .join("\n")}`,
      );
    }

    const userMsg = parts.join("\n\n");
    fs.writeFileSync(path.join(OUT_DIR, "stage-4-distillation-input.txt"), userMsg);
    console.log(`\n  Total distillation input: ${userMsg.length} chars`);
    console.log(`  Written to /tmp/warmup-debug/stage-4-distillation-input.txt`);

    try {
      const prompt = loadPrompt("websiteAgents/builder/IdentityDistiller");
      const t0 = Date.now();
      const result = await runAgent({
        systemPrompt: prompt,
        userMessage: userMsg,
        model: process.env.AGENTS_LLM_MODEL || "claude-sonnet-4-6",
        maxTokens: 8000,
      });
      console.log(`  Elapsed: ${Date.now() - t0}ms`);
      console.log(`  Tokens: in=${result.inputTokens} out=${result.outputTokens}`);
      // Runner already parses JSON into `parsed`, or falls back to raw string.
      let parsed: any = (result as any).parsed;
      const raw: string = (result as any).raw || "";
      if (!parsed && raw) {
        try {
          const match = raw.match(/\{[\s\S]*\}/);
          if (match) parsed = JSON.parse(match[0]);
        } catch {}
      }
      console.log(`  Raw LLM output (first 3000 chars):`);
      console.log(raw.slice(0, 3000));
      save("stage-4-distillation.json", { raw, parsed });

      if (parsed) {
        sub("Distillation Analysis");
        console.log(`  UVP: ${parsed.unique_value_proposition ? "YES" : "NO"}`);
        console.log(`    "${parsed.unique_value_proposition || ""}"`);
        console.log(`  Certifications: ${(parsed.certifications || []).length}`);
        for (const c of (parsed.certifications || []).slice(0, 10)) console.log(`    - ${c}`);
        console.log(`  Service areas: ${(parsed.service_areas || []).length}`);
        for (const s of (parsed.service_areas || []).slice(0, 10)) console.log(`    - ${s}`);
        console.log(`  Doctors: ${(parsed.doctors || []).length}`);
        for (const d of parsed.doctors || []) {
          const creds = Array.isArray(d.credentials) ? d.credentials.join(", ") : "(no creds field)";
          const locs = Array.isArray(d.location_place_ids) ? d.location_place_ids.join(",") : "(no locs field)";
          console.log(`    - ${d.name}`);
          console.log(`        url: ${d.source_url || "—"}`);
          console.log(`        credentials: [${creds}]`);
          console.log(`        location_place_ids: [${locs}]`);
          console.log(`        blurb: "${(d.short_blurb || "").slice(0, 100)}..."`);
        }
        console.log(`  Services: ${(parsed.services || []).length}`);
        for (const s of parsed.services || []) console.log(`    - ${s.name} | ${s.source_url || "no-url"}`);
        console.log(`  Testimonials: ${(parsed.featured_testimonials || []).length}`);
        console.log(`  Core values: ${(parsed.core_values || []).length}`);
      }
    } catch (err: any) {
      console.error(`  FAILED: ${err?.message}`);
    }
  }

  await db.destroy();
  header("Done");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
