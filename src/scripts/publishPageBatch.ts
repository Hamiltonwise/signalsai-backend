/**
 * Staged Publishing Script for Programmatic SEO Pages
 *
 * Generates and publishes programmatic pages in batches using real Places API data.
 *
 * Usage:
 *   npx tsx src/scripts/publishPageBatch.ts --batch-size 50 --specialty endodontist
 *   npx tsx src/scripts/publishPageBatch.ts --batch-size 200
 *   npx tsx src/scripts/publishPageBatch.ts --batch-size 10 --dry-run
 */

import * as dotenv from "dotenv";
dotenv.config();

import { db, closeConnection } from "../database/connection";
import { CITY_DATA, SPECIALTIES, buildPageSlug } from "../data/cityData";
import { generatePage } from "../services/programmaticSEO";

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(): {
  batchSize: number;
  specialty: string | undefined;
  dryRun: boolean;
} {
  const args = process.argv.slice(2);

  const batchSizeIdx = args.indexOf("--batch-size");
  const specialtyIdx = args.indexOf("--specialty");
  const dryRun = args.includes("--dry-run");

  const batchSize =
    batchSizeIdx >= 0 ? parseInt(args[batchSizeIdx + 1], 10) : 50;
  const specialty =
    specialtyIdx >= 0 ? args[specialtyIdx + 1] : undefined;

  if (isNaN(batchSize) || batchSize < 1) {
    console.error("Invalid --batch-size. Must be a positive integer.");
    process.exit(1);
  }

  return { batchSize, specialty, dryRun };
}

// ---------------------------------------------------------------------------
// Check if a page already exists in the database
// ---------------------------------------------------------------------------

async function pageExists(pageSlug: string): Promise<boolean> {
  const row = await db("programmatic_pages")
    .where({ page_slug: pageSlug })
    .select("id")
    .first();
  return !!row;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { batchSize, specialty, dryRun } = parseArgs();

  console.log("=== Alloro Programmatic Page Publisher ===");
  console.log(`  Batch size: ${batchSize}`);
  console.log(`  Specialty:  ${specialty || "all"}`);
  console.log(`  Dry run:    ${dryRun}`);
  console.log("");

  // Filter specialties if --specialty flag provided
  const specs = specialty
    ? SPECIALTIES.filter((s) => s.slug === specialty)
    : SPECIALTIES;

  if (specs.length === 0) {
    console.error(
      `Unknown specialty "${specialty}". Available: ${SPECIALTIES.map((s) => s.slug).join(", ")}`
    );
    process.exit(1);
  }

  // Build the full list of specialty+city combinations
  const combinations: { specialty: (typeof SPECIALTIES)[number]; city: (typeof CITY_DATA)[number] }[] = [];
  for (const spec of specs) {
    for (const city of CITY_DATA) {
      combinations.push({ specialty: spec, city });
    }
  }

  let generated = 0;
  let skipped = 0;
  let failed = 0;
  let processed = 0;

  console.log(
    `Total combinations: ${combinations.length}. Processing up to ${batchSize}.\n`
  );

  for (const combo of combinations) {
    if (generated + skipped >= batchSize) break;

    const pageSlug = buildPageSlug(combo.specialty.slug, combo.city);

    // Check if page already exists
    const exists = await pageExists(pageSlug);
    if (exists) {
      skipped++;
      processed++;
      continue;
    }

    if (dryRun) {
      console.log(
        `[DRY RUN] Would generate: ${pageSlug} (${processed + 1}/${batchSize})`
      );
      generated++;
      processed++;
      continue;
    }

    try {
      await generatePage(combo.specialty, combo.city);

      // Mark as published
      await db("programmatic_pages")
        .where({ page_slug: pageSlug })
        .update({
          status: "published",
          published_at: new Date(),
          updated_at: new Date(),
        });

      generated++;
      processed++;
      console.log(
        `Published ${pageSlug} (${generated}/${batchSize - skipped})`
      );

      // 1-second delay between API calls to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (err) {
      failed++;
      processed++;
      const msg =
        err instanceof Error ? err.message : String(err);
      console.error(`FAILED ${pageSlug}: ${msg}`);

      // Mark failed pages as needs_refresh if they were partially created
      try {
        await db("programmatic_pages")
          .where({ page_slug: pageSlug })
          .update({ needs_refresh: true, updated_at: new Date() });
      } catch {
        // Page may not exist yet if generation failed early — that's fine
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log("\n=== Publishing Summary ===");
  console.log(`  Generated: ${generated}`);
  console.log(`  Skipped (already exist): ${skipped}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total processed: ${processed}`);

  if (!dryRun) {
    // Print overall database stats
    try {
      const stats = await db("programmatic_pages")
        .select(
          db.raw("COUNT(*) as total"),
          db.raw(
            "COUNT(*) FILTER (WHERE status = 'published') as published"
          ),
          db.raw("COUNT(*) FILTER (WHERE status = 'draft') as draft"),
          db.raw(
            "COUNT(*) FILTER (WHERE needs_refresh = true) as needs_refresh"
          )
        )
        .first() as { total: string; published: string; draft: string; needs_refresh: string } | undefined;

      if (stats) {
        console.log("\n=== Database Stats ===");
        console.log(`  Total pages:    ${stats.total}`);
        console.log(`  Published:      ${stats.published}`);
        console.log(`  Draft:          ${stats.draft}`);
        console.log(`  Needs refresh:  ${stats.needs_refresh}`);
      }
    } catch {
      // Stats query may fail if table doesn't exist yet
    }
  }
}

main()
  .catch((err) => {
    console.error("Publishing script failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeConnection();
  });
