/**
 * Staged Publishing Protocol for Programmatic SEO Pages
 *
 * Usage:
 *   npx ts-node src/scripts/publishPageBatch.ts [--limit N] [--specialty slug] [--dry-run]
 *
 * Stages:
 *   1. First run: 50 pages (initial index test)
 *   2. Second run: 200 pages
 *   3. Subsequent runs: 100 pages per batch
 */

import dotenv from "dotenv";
dotenv.config();

import { db } from "../database/connection";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limitIdx = args.indexOf("--limit");
  const specialtyIdx = args.indexOf("--specialty");

  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 50;
  const specialty = specialtyIdx >= 0 ? args[specialtyIdx + 1] : undefined;

  console.log(`Programmatic SEO Page Publisher`);
  console.log(`  Limit: ${limit}`);
  console.log(`  Specialty filter: ${specialty || "all"}`);
  console.log(`  Dry run: ${dryRun}`);
  console.log("");

  // Find draft pages with real competitor data (non-empty competitors_snapshot)
  let query = db("programmatic_pages")
    .where("published", false)
    .whereNotNull("competitors_snapshot")
    .whereRaw("competitors_snapshot::text != '[]'")
    .whereRaw("competitors_snapshot::text != 'null'")
    .limit(limit);

  if (specialty) {
    query = query.where("specialty_slug", specialty);
  }

  const pages = await query.select("id", "page_slug", "specialty_name", "city_name", "state_abbr");

  console.log(`Found ${pages.length} draft pages ready for publishing.`);

  if (pages.length === 0) {
    console.log("No pages to publish. Generate pages first using the programmatic SEO service.");
    process.exit(0);
  }

  console.log("\nPages to publish:");
  for (const page of pages) {
    console.log(`  ${page.page_slug} (${page.specialty_name} in ${page.city_name}, ${page.state_abbr})`);
  }

  if (dryRun) {
    console.log("\nDry run complete. No pages published.");
    process.exit(0);
  }

  // Publish the batch
  const ids = pages.map((p: { id: number }) => p.id);
  const published = await db("programmatic_pages")
    .whereIn("id", ids)
    .update({
      published: true,
      published_at: new Date(),
      updated_at: new Date(),
    });

  console.log(`\nPublished ${published} pages.`);

  // Log stats
  const stats = await db("programmatic_pages")
    .select(
      db.raw("COUNT(*) as total"),
      db.raw("COUNT(*) FILTER (WHERE published = true) as published"),
      db.raw("COUNT(*) FILTER (WHERE published = false) as draft")
    )
    .first();

  console.log(`\nTotal pages: ${stats.total}`);
  console.log(`Published: ${stats.published}`);
  console.log(`Draft: ${stats.draft}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Publishing failed:", err);
  process.exit(1);
});
