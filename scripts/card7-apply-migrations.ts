/**
 * Card 7 — apply the live_activity_entries + signal_events column
 * additions directly. Same pattern as the prior card migration appliers.
 */

import { db } from "../src/database/connection";
import { up as upPerQueryReceipts } from "../src/database/migrations/20260504000004_live_activity_per_query_receipts";

async function nextBatch(): Promise<number> {
  const row = await db("knex_migrations").max<{ max: number }[]>("batch as max").first();
  const max = (row && (row as unknown as { max: number | null }).max) ?? 0;
  return (max ?? 0) + 1;
}

async function main(): Promise<void> {
  const batch = await nextBatch();
  console.log(`[card7-migrate] using batch ${batch}`);

  const name = "20260504000004_live_activity_per_query_receipts.ts";

  const cols = [
    { table: "live_activity_entries", col: "patient_question" },
    { table: "live_activity_entries", col: "visibility_snapshot" },
    { table: "live_activity_entries", col: "action_taken" },
    { table: "signal_events", col: "action_log" },
  ];
  let allPresent = true;
  for (const { table, col } of cols) {
    const has = await db.schema.hasColumn(table, col);
    if (!has) {
      allPresent = false;
      break;
    }
  }
  if (allPresent) {
    console.log(`[card7-migrate] ${name} → all columns already exist, skipping up()`);
  } else {
    console.log(`[card7-migrate] applying ${name}`);
    await upPerQueryReceipts(db);
    console.log(`[card7-migrate]   ${name} ✓`);
  }
  const tracked = await db("knex_migrations").where({ name }).first();
  if (!tracked) {
    await db("knex_migrations").insert({ name, batch, migration_time: new Date() });
    console.log(`[card7-migrate]   tracked in knex_migrations`);
  } else {
    console.log(`[card7-migrate]   already tracked`);
  }

  // Verify
  console.log("[card7-migrate] post-state:");
  for (const { table, col } of cols) {
    const has = await db.schema.hasColumn(table, col);
    console.log(`  ${table}.${col}: ${has ? "PRESENT" : "MISSING"}`);
  }
}

main()
  .catch((err) => {
    console.error("[card7-migrate] FAILED:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.destroy();
  });
