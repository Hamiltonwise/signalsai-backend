/**
 * One-shot migration applier for the Answer Engine Phase 1 tables.
 *
 * Background: this repo's knex_migrations tracking table stores legacy
 * migrations under their .js basenames (the project was previously
 * compiled to dist/ before migration). knex migrate:latest refuses to
 * proceed when it sees .js entries in the tracking table that no longer
 * exist in the .ts source directory. Resolving that drift is out of
 * scope for this Phase 1 build.
 *
 * This script applies the four new Answer Engine migrations directly via
 * the project's existing db connection, then inserts the corresponding
 * rows into knex_migrations so a future `npm run db:migrate` (once the
 * legacy drift is cleaned up) does not double-run them. Idempotent: if a
 * migration has already been applied (table exists or row exists in
 * knex_migrations), it is skipped.
 */

import { db } from "../src/database/connection";
import { up as upSignalEvents } from "../src/database/migrations/20260502000001_create_signal_events";
import { up as upAeoCitations } from "../src/database/migrations/20260502000002_create_aeo_citations";
import { up as upLiveActivity } from "../src/database/migrations/20260502000003_create_live_activity_entries";
import { up as upAeoTestQueries } from "../src/database/migrations/20260502000004_create_aeo_test_queries";

interface Step {
  name: string;
  table: string;
  up: (knex: typeof db) => Promise<void>;
}

const steps: Step[] = [
  {
    name: "20260502000001_create_signal_events.ts",
    table: "signal_events",
    up: upSignalEvents,
  },
  {
    name: "20260502000002_create_aeo_citations.ts",
    table: "aeo_citations",
    up: upAeoCitations,
  },
  {
    name: "20260502000003_create_live_activity_entries.ts",
    table: "live_activity_entries",
    up: upLiveActivity,
  },
  {
    name: "20260502000004_create_aeo_test_queries.ts",
    table: "aeo_test_queries",
    up: upAeoTestQueries,
  },
];

async function nextBatch(): Promise<number> {
  const row = await db("knex_migrations").max<{ max: number }[]>("batch as max").first();
  const max = (row && (row as unknown as { max: number | null }).max) ?? 0;
  return (max ?? 0) + 1;
}

async function main(): Promise<void> {
  const batch = await nextBatch();
  console.log(`[migrate] using batch ${batch}`);

  for (const step of steps) {
    const exists = await db.schema.hasTable(step.table);
    if (exists) {
      console.log(`[migrate] ${step.name} → table ${step.table} already exists, skipping up()`);
    } else {
      console.log(`[migrate] applying ${step.name}`);
      await step.up(db);
      console.log(`[migrate]   ${step.name} ✓`);
    }
    const tracked = await db("knex_migrations").where({ name: step.name }).first();
    if (!tracked) {
      await db("knex_migrations").insert({
        name: step.name,
        batch,
        migration_time: new Date(),
      });
      console.log(`[migrate]   tracked in knex_migrations`);
    } else {
      console.log(`[migrate]   already tracked`);
    }
  }

  console.log("[migrate] all four answer-engine migrations applied & tracked");
}

main()
  .catch((err) => {
    console.error("[migrate] FAILED:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.destroy();
  });
