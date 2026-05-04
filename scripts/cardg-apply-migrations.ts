import { db } from "../src/database/connection";
import { up as upG } from "../src/database/migrations/20260504000007_organizations_location_display_order";

async function nextBatch(): Promise<number> {
  const row = await db("knex_migrations").max<{ max: number }[]>("batch as max").first();
  const max = (row && (row as unknown as { max: number | null }).max) ?? 0;
  return (max ?? 0) + 1;
}

async function main(): Promise<void> {
  const batch = await nextBatch();
  console.log(`[cardg-migrate] using batch ${batch}`);
  const name = "20260504000007_organizations_location_display_order.ts";
  await upG(db);
  const tracked = await db("knex_migrations").where({ name }).first();
  if (!tracked) {
    await db("knex_migrations").insert({ name, batch, migration_time: new Date() });
    console.log(`[cardg-migrate]   tracked in knex_migrations`);
  } else {
    console.log(`[cardg-migrate]   already tracked`);
  }

  // Verify column shape
  const col = await db.raw(
    `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_name = 'organizations' AND column_name = 'location_display_order'`,
  );
  console.log("[cardg-migrate] column:", col.rows[0]);

  // Sanity sample: any orgs with non-empty order yet?
  const sample = await db.raw(
    `SELECT id, name, location_display_order
       FROM organizations
       WHERE jsonb_array_length(location_display_order) > 0
       ORDER BY id ASC
       LIMIT 5`,
  );
  console.log(`[cardg-migrate] sample non-empty rows:`, sample.rows);
}

main()
  .catch((err) => {
    console.error("[cardg-migrate] FAILED:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.destroy();
  });
