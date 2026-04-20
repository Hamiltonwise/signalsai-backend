/**
 * Dump the current state of project_identity for the Coastal project.
 * Answers: did the re-run actually persist fresh data, or is the UI showing
 * stale state?
 */
import * as dotenv from "dotenv";
dotenv.config({ path: "/Users/rustinedave/Desktop/alloro/.env" });

import db from "../../src/database/connection";

const PROJECT_ID = "99fd9fdc-f53d-4602-8e4a-3c770d739bf5";

(async () => {
  const row = await db("website_builder.projects")
    .where("id", PROJECT_ID)
    .select(
      "id",
      "display_name",
      "project_identity",
      "primary_place_id",
      "selected_place_ids",
      "updated_at",
    )
    .first();

  if (!row) {
    console.log("NOT FOUND");
    await db.destroy();
    return;
  }

  const id = row.project_identity as any;
  console.log("=".repeat(70));
  console.log(`Project: ${row.display_name}`);
  console.log(`projects.updated_at: ${row.updated_at}`);
  console.log(`primary_place_id:    ${row.primary_place_id}`);
  console.log(`selected_place_ids:  ${JSON.stringify(row.selected_place_ids)}`);
  console.log("=".repeat(70));

  if (!id) {
    console.log("project_identity: NULL");
    await db.destroy();
    return;
  }

  console.log(`\n--- meta ---`);
  console.log(`warmup_status: ${id.meta?.warmup_status}`);
  console.log(`version: ${id.version}`);
  console.log(`warmed_up_at: ${id.warmed_up_at}`);
  console.log(`last_updated_at: ${id.last_updated_at}`);

  console.log(`\n--- business ---`);
  console.log(`name: ${id.business?.name}`);
  console.log(`category: ${id.business?.category}`);
  console.log(`phone: ${id.business?.phone}`);
  console.log(`address: ${id.business?.address}`);
  console.log(`hours: ${id.business?.hours ? JSON.stringify(id.business.hours).slice(0, 150) + "..." : "NULL"}`);

  console.log(`\n--- brand ---`);
  console.log(`logo_s3_url: ${id.brand?.logo_s3_url || "NULL"}`);
  console.log(`primary_color: ${id.brand?.primary_color}`);

  console.log(`\n--- voice_and_tone ---`);
  console.log(`archetype: ${id.voice_and_tone?.archetype}`);
  console.log(`tone: ${id.voice_and_tone?.tone_descriptor}`);

  console.log(`\n--- content_essentials ---`);
  const ce = id.content_essentials || {};
  console.log(`UVP: ${ce.unique_value_proposition || "(empty)"}`);
  console.log(`certifications: ${JSON.stringify(ce.certifications || [])}`);
  console.log(`service_areas: ${JSON.stringify(ce.service_areas || [])}`);
  console.log(`core_values: ${(ce.core_values || []).length} items`);
  console.log(`featured_testimonials: ${(ce.featured_testimonials || []).length} items`);
  console.log(`doctors: ${(ce.doctors || []).length} items`);
  for (const d of ce.doctors || []) {
    console.log(`  - ${d.name} | url=${d.source_url || "—"} | creds=${JSON.stringify(d.credentials || [])}`);
  }
  console.log(`services: ${(ce.services || []).length} items`);
  for (const s of ce.services || []) {
    console.log(`  - ${s.name}`);
  }

  console.log(`\n--- locations ---`);
  console.log(`count: ${(id.locations || []).length}`);
  for (const l of id.locations || []) {
    console.log(`  - ${l.name} @ ${l.address} | primary=${l.is_primary} | status=${l.warmup_status}`);
  }

  console.log(`\n--- sources_used ---`);
  console.log(`gbp: ${id.sources_used?.gbp ? JSON.stringify(id.sources_used.gbp) : "NULL"}`);
  const urls = id.sources_used?.urls || [];
  console.log(`urls (${urls.length}):`);
  for (const u of urls) {
    console.log(`  - ${u.url} | char=${u.char_length} | strategy=${u.strategy_used_final || "—"} | at=${u.scraped_at}`);
  }

  console.log(`\n--- extracted_assets ---`);
  const imgs = id.extracted_assets?.images || [];
  const discovered = id.extracted_assets?.discovered_pages || [];
  console.log(`images: ${imgs.length}`);
  console.log(`discovered_pages: ${discovered.length}`);
  for (const p of discovered.slice(0, 12)) {
    console.log(`  - ${p.url} | title=${p.title}`);
  }

  console.log(`\n--- raw_inputs ---`);
  const scrapedKeys = Object.keys(id.raw_inputs?.scraped_pages_raw || {});
  console.log(`scraped_pages_raw keys (${scrapedKeys.length}):`);
  for (const k of scrapedKeys.slice(0, 12)) {
    const content = id.raw_inputs.scraped_pages_raw[k] as string;
    console.log(`  - ${k} (${content?.length || 0} chars)`);
  }

  await db.destroy();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
