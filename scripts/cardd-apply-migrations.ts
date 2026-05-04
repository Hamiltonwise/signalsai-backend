import { db } from "../src/database/connection";
import { up as upD } from "../src/database/migrations/20260504000006_vocabulary_configs_approved_adjacent_specialties";

async function nextBatch(): Promise<number> {
  const row = await db("knex_migrations").max<{ max: number }[]>("batch as max").first();
  const max = (row && (row as unknown as { max: number | null }).max) ?? 0;
  return (max ?? 0) + 1;
}

async function main(): Promise<void> {
  const batch = await nextBatch();
  console.log(`[cardd-migrate] using batch ${batch}`);
  const name = "20260504000006_vocabulary_configs_approved_adjacent_specialties.ts";
  await upD(db);
  const tracked = await db("knex_migrations").where({ name }).first();
  if (!tracked) {
    await db("knex_migrations").insert({ name, batch, migration_time: new Date() });
    console.log(`[cardd-migrate]   tracked in knex_migrations`);
  } else {
    console.log(`[cardd-migrate]   already tracked`);
  }

  // Verify
  const col = await db.raw(
    `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_name = 'vocabulary_configs' AND column_name = 'approved_adjacent_specialties'`,
  );
  console.log("[cardd-migrate] column:", col.rows[0]);

  const rows = await db
    .raw(
      `SELECT vertical, approved_adjacent_specialties
         FROM vocabulary_configs
         WHERE jsonb_array_length(approved_adjacent_specialties) > 0
         ORDER BY vertical`,
    );
  console.log("[cardd-migrate] seeded vocab rows:");
  for (const r of rows.rows ?? []) {
    console.log(`  ${r.vertical}: ${JSON.stringify(r.approved_adjacent_specialties)}`);
  }
}

main()
  .catch((err) => {
    console.error("[cardd-migrate] FAILED:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.destroy();
  });
