/**
 * Card 6 — apply the live_activity_entries.is_anchor_entry migration
 * directly. Same pattern as scripts/answer-engine-apply-migrations.ts and
 * scripts/card4-apply-migrations.ts.
 */

import { db } from "../src/database/connection";
import { up as upAnchorColumn } from "../src/database/migrations/20260504000003_live_activity_anchor";

async function nextBatch(): Promise<number> {
  const row = await db("knex_migrations").max<{ max: number }[]>("batch as max").first();
  const max = (row && (row as unknown as { max: number | null }).max) ?? 0;
  return (max ?? 0) + 1;
}

async function main(): Promise<void> {
  const batch = await nextBatch();
  console.log(`[card6-migrate] using batch ${batch}`);

  const name = "20260504000003_live_activity_anchor.ts";
  const hasCol = await db.schema.hasColumn("live_activity_entries", "is_anchor_entry");
  if (hasCol) {
    console.log(`[card6-migrate] ${name} → is_anchor_entry already exists, skipping up()`);
  } else {
    console.log(`[card6-migrate] applying ${name}`);
    await upAnchorColumn(db);
    console.log(`[card6-migrate]   ${name} ✓`);
  }
  const tracked = await db("knex_migrations").where({ name }).first();
  if (!tracked) {
    await db("knex_migrations").insert({ name, batch, migration_time: new Date() });
    console.log(`[card6-migrate]   tracked in knex_migrations`);
  } else {
    console.log(`[card6-migrate]   already tracked`);
  }

  // Verification readouts
  const indexExists = await db.raw(
    `SELECT indexname FROM pg_indexes
     WHERE tablename = 'live_activity_entries' AND indexname = 'idx_live_activity_anchor'`,
  );
  console.log(
    `[card6-migrate] anchor partial index present: ${indexExists.rows.length > 0}`,
  );

  const colInfo = await db.raw(
    `SELECT column_name, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_name = 'live_activity_entries'
         AND column_name = 'is_anchor_entry'`,
  );
  console.log("[card6-migrate] is_anchor_entry column:", colInfo.rows[0]);
}

main()
  .catch((err) => {
    console.error("[card6-migrate] FAILED:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.destroy();
  });
