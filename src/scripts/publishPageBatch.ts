/**
 * WO-7 Component 8: Staged Publishing Protocol
 *
 * Publishing schedule:
 * - Batch 1: 50 pages (Tier 1 cities, top specialties)
 * - Batch 2: 200 pages (Tier 1-2 cities, all dental specialties)
 * - Batch 3+: 100 pages/week (remaining cities and specialties)
 *
 * Usage:
 *   npx ts-node src/scripts/publishPageBatch.ts --batch 1
 *   npx ts-node src/scripts/publishPageBatch.ts --batch 2
 *   npx ts-node src/scripts/publishPageBatch.ts --generate --batch 1
 */

import knex from "../database/connection";
import { CITIES, SPECIALTIES, toSlug, buildPageSlug } from "../data/cityData";
import {
  generateAndStorePage,
} from "../services/programmaticPageGenerator";
import { updateAllSpokeLinks } from "../services/aeoLinking";

interface BatchConfig {
  batchNumber: number;
  maxPages: number;
  minIcpDensity: number;
  specialtySlugs: string[];
}

const BATCH_CONFIGS: Record<number, BatchConfig> = {
  1: {
    batchNumber: 1,
    maxPages: 50,
    minIcpDensity: 9,
    specialtySlugs: ["endodontist", "orthodontist", "oral-surgeon", "chiropractor", "optometrist"],
  },
  2: {
    batchNumber: 2,
    maxPages: 200,
    minIcpDensity: 8,
    specialtySlugs: SPECIALTIES.map((s) => s.slug),
  },
  3: {
    batchNumber: 3,
    maxPages: 100,
    minIcpDensity: 6,
    specialtySlugs: SPECIALTIES.map((s) => s.slug),
  },
  4: {
    batchNumber: 4,
    maxPages: 100,
    minIcpDensity: 1,
    specialtySlugs: SPECIALTIES.map((s) => s.slug),
  },
};

async function generateBatch(batchNumber: number): Promise<void> {
  const config = BATCH_CONFIGS[batchNumber];
  if (!config) {
    console.error(`Unknown batch number: ${batchNumber}. Use 1-4.`);
    process.exit(1);
  }

  console.log(`\nGenerating batch ${batchNumber} (max ${config.maxPages} pages)...`);

  const cities = CITIES.filter((c) => c.icpDensity >= config.minIcpDensity);
  const specialties = SPECIALTIES.filter((s) =>
    config.specialtySlugs.includes(s.slug)
  );

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const specialty of specialties) {
    if (generated >= config.maxPages) break;

    for (const city of cities) {
      if (generated >= config.maxPages) break;

      try {
        const pageId = await generateAndStorePage(
          specialty.name,
          specialty.slug,
          city.city,
          city.stateAbbr,
          city.slug,
          batchNumber
        );

        if (pageId) {
          generated++;
          console.log(
            `  [${generated}/${config.maxPages}] ${specialty.slug}-${city.slug}`
          );
        } else {
          skipped++;
        }
      } catch (error) {
        failed++;
        console.error(
          `  FAILED: ${specialty.slug}-${city.slug}:`,
          error instanceof Error ? error.message : error
        );
      }
    }
  }

  console.log(
    `\nBatch ${batchNumber} complete: ${generated} generated, ${skipped} skipped, ${failed} failed`
  );
}

async function publishBatch(batchNumber: number): Promise<void> {
  const result = await knex("programmatic_pages")
    .where({ publish_batch: batchNumber, published: false })
    .update({
      published: true,
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

  console.log(`Published ${result} pages in batch ${batchNumber}`);

  // Update spoke links for all published pages
  const linkedCount = await updateAllSpokeLinks();
  console.log(`Updated spoke links for ${linkedCount} pages`);
}

async function showStats(): Promise<void> {
  const stats = await knex("programmatic_pages")
    .select(
      knex.raw("publish_batch"),
      knex.raw("COUNT(*) as total"),
      knex.raw("COUNT(*) FILTER (WHERE published = true) as published"),
      knex.raw("COUNT(*) FILTER (WHERE needs_refresh = true) as needs_refresh")
    )
    .groupBy("publish_batch")
    .orderBy("publish_batch");

  console.log("\nProgrammatic Pages Stats:");
  console.log("Batch | Total | Published | Needs Refresh");
  console.log("------|-------|-----------|---------------");
  for (const row of stats) {
    console.log(
      `  ${row.publish_batch || "N/A"}   |  ${row.total}   |    ${row.published}     |      ${row.needs_refresh}`
    );
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const batchFlag = args.indexOf("--batch");
  const batchNumber = batchFlag >= 0 ? parseInt(args[batchFlag + 1], 10) : 0;
  const shouldGenerate = args.includes("--generate");
  const shouldStats = args.includes("--stats");

  try {
    if (shouldStats) {
      await showStats();
    } else if (shouldGenerate && batchNumber > 0) {
      await generateBatch(batchNumber);
    } else if (batchNumber > 0) {
      await publishBatch(batchNumber);
    } else {
      console.log("Usage:");
      console.log(
        "  npx ts-node src/scripts/publishPageBatch.ts --generate --batch 1  # Generate batch"
      );
      console.log(
        "  npx ts-node src/scripts/publishPageBatch.ts --batch 1             # Publish batch"
      );
      console.log(
        "  npx ts-node src/scripts/publishPageBatch.ts --stats               # Show stats"
      );
    }
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  } finally {
    await knex.destroy();
  }
}

main();
