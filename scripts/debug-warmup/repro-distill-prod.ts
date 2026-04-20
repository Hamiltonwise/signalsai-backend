/**
 * Reproduce the production distillContent call with the EXACT scraped content
 * that's in the DB right now. Watches for failures the production path might
 * be silently swallowing.
 */
import * as dotenv from "dotenv";
dotenv.config({ path: "/Users/rustinedave/Desktop/alloro/.env" });

import db from "../../src/database/connection";
import { runAgent } from "../../src/agents/service.llm-runner";
import { loadPrompt } from "../../src/agents/service.prompt-loader";

const PROJECT_ID = "99fd9fdc-f53d-4602-8e4a-3c770d739bf5";

(async () => {
  const row = await db("website_builder.projects")
    .where("id", PROJECT_ID)
    .select("project_identity")
    .first();

  const id = row.project_identity as any;
  const scraped = id?.raw_inputs?.scraped_pages_raw || {};
  const urls = Object.keys(scraped);
  console.log(`Using ${urls.length} scraped pages from DB. Total chars: ${Object.values(scraped).reduce((s: number, v: any) => s + (v?.length || 0), 0)}`);

  // Reproduce distillContent's prompt assembly EXACTLY.
  const parts: string[] = [];

  const discoveredUrls = (id?.extracted_assets?.discovered_pages || [])
    .map((p: any) => p.url)
    .filter(Boolean);
  if (discoveredUrls.length > 0) {
    parts.push(
      `## DISCOVERED PAGES (use ONLY these exact URLs for doctors[].source_url and services[].source_url)\n\n${discoveredUrls.map((u: string) => `- ${u}`).join("\n")}`,
    );
  }

  // LOCATIONS block (T4)
  const locs = id?.locations || [];
  if (locs.length > 0) {
    const locBlock = locs
      .map((l: any) => `- ${l.place_id} — ${l.name} — ${l.address || ""}`)
      .join("\n");
    parts.push(
      `## LOCATIONS (use these place_ids for doctors[].location_place_ids when the doctor is explicitly tied to an office)\n\n${locBlock}`,
    );
  }

  if (Object.keys(scraped).length > 0) {
    const pagesText = Object.entries(scraped)
      .map(([key, content]) => `### ${key}\n${String(content).slice(0, 15000)}`)
      .join("\n\n");
    parts.push(`## Website Content\n\n${pagesText}`);
  }

  // GBP Reviews from raw_inputs.gbp_raw
  const gbpRaw = id?.raw_inputs?.gbp_raw;
  const reviews = Array.isArray(gbpRaw?.reviews) ? gbpRaw.reviews.slice(0, 10) : [];
  if (reviews.length > 0) {
    parts.push(
      `## GBP Reviews (for themes + testimonials)\n\n${reviews
        .map((r: any) => `- ${r.name || "Anonymous"} (${r.stars || r.rating}⭐): ${(r.text || "").slice(0, 500)}`)
        .join("\n")}`,
    );
  }

  const userMessage = parts.join("\n\n");
  console.log(`\nTotal user message: ${userMessage.length} chars`);
  console.log(`Parts: ${parts.length}`);

  // Call runAgent EXACTLY as distillContent does
  const prompt = loadPrompt("websiteAgents/builder/IdentityDistiller");
  console.log(`System prompt: ${prompt.length} chars`);

  console.log(`\nCalling runAgent with prefill="{" maxTokens=4096 ...`);
  try {
    const result = await runAgent({
      systemPrompt: prompt,
      userMessage,
      prefill: "{",
      maxTokens: 4096,
    });
    console.log(`\n=== RESULT ===`);
    console.log(`input tokens:  ${result.inputTokens}`);
    console.log(`output tokens: ${result.outputTokens}`);
    console.log(`raw length:    ${result.raw?.length || 0}`);
    console.log(`parsed:        ${result.parsed ? "yes" : "NULL"}`);
    console.log(`\nraw first 1000 chars:`);
    console.log(result.raw?.slice(0, 1000) || "(empty)");
    console.log(`\nraw LAST 500 chars:`);
    console.log(result.raw?.slice(-500) || "(empty)");
    if (result.parsed) {
      console.log(`\n=== PARSED ===`);
      console.log(`UVP: ${result.parsed.unique_value_proposition || "(none)"}`);
      console.log(`doctors: ${(result.parsed.doctors || []).length}`);
      console.log(`services: ${(result.parsed.services || []).length}`);
    }
  } catch (err: any) {
    console.error(`\n❌ runAgent THREW: ${err?.message}`);
    console.error(err?.stack);
  }

  await db.destroy();
})();
