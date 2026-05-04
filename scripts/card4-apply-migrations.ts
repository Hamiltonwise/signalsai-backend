/**
 * Card 4 — apply the two new migrations directly.
 *
 * Same pattern as scripts/answer-engine-apply-migrations.ts. The repo's
 * knex_migrations table holds .js entries from a legacy build, so
 * `npm run db:migrate` refuses to proceed. This script applies the two
 * Card 4 migrations and tracks them in knex_migrations.
 */

import { db } from "../src/database/connection";
import { up as upVerticalColumn } from "../src/database/migrations/20260504000001_aeo_test_queries_vertical";
import { up as upOrthoSeed } from "../src/database/migrations/20260504000002_seed_orthodontics_aeo_queries";

interface Step {
  name: string;
  detect: () => Promise<boolean>;
  up: (knex: typeof db) => Promise<void>;
}

const steps: Step[] = [
  {
    name: "20260504000001_aeo_test_queries_vertical.ts",
    detect: async () => {
      const row = await db.raw(
        `SELECT is_nullable FROM information_schema.columns
         WHERE table_name = 'aeo_test_queries' AND column_name = 'vertical'`,
      );
      const r = row?.rows?.[0];
      return r ? r.is_nullable === "NO" : false;
    },
    up: upVerticalColumn,
  },
  {
    name: "20260504000002_seed_orthodontics_aeo_queries.ts",
    detect: async () => {
      const r = await db("aeo_test_queries")
        .where({ vertical: "orthodontics" })
        .count<{ count: string }[]>("id as count")
        .first();
      const n = Number(r?.count ?? 0);
      return n >= 25;
    },
    up: upOrthoSeed,
  },
];

async function nextBatch(): Promise<number> {
  const row = await db("knex_migrations").max<{ max: number }[]>("batch as max").first();
  const max = (row && (row as unknown as { max: number | null }).max) ?? 0;
  return (max ?? 0) + 1;
}

async function main(): Promise<void> {
  const batch = await nextBatch();
  console.log(`[card4-migrate] using batch ${batch}`);

  for (const step of steps) {
    const alreadyApplied = await step.detect();
    if (alreadyApplied) {
      console.log(`[card4-migrate] ${step.name} → effect already present, skipping up()`);
    } else {
      console.log(`[card4-migrate] applying ${step.name}`);
      await step.up(db);
      console.log(`[card4-migrate]   ${step.name} ✓`);
    }
    const tracked = await db("knex_migrations").where({ name: step.name }).first();
    if (!tracked) {
      await db("knex_migrations").insert({
        name: step.name,
        batch,
        migration_time: new Date(),
      });
      console.log(`[card4-migrate]   tracked in knex_migrations`);
    } else {
      console.log(`[card4-migrate]   already tracked`);
    }
  }

  // Verification readouts
  const counts = await db("aeo_test_queries")
    .select("vertical")
    .count<Array<{ vertical: string; count: string }>>("id as count")
    .groupBy("vertical")
    .orderBy("vertical");
  console.log("[card4-migrate] vertical counts:", JSON.stringify(counts));

  const indexExists = await db.raw(
    `SELECT indexname FROM pg_indexes
     WHERE tablename = 'aeo_test_queries' AND indexname = 'idx_aeo_test_queries_vertical'`,
  );
  console.log(
    `[card4-migrate] vertical index present: ${indexExists.rows.length > 0}`,
  );
}

main()
  .catch((err) => {
    console.error("[card4-migrate] FAILED:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.destroy();
  });
