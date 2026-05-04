import { db } from "../src/database/connection";
import { up as upH } from "../src/database/migrations/20260504000005_location_notification_config";

async function nextBatch(): Promise<number> {
  const row = await db("knex_migrations").max<{ max: number }[]>("batch as max").first();
  const max = (row && (row as unknown as { max: number | null }).max) ?? 0;
  return (max ?? 0) + 1;
}

async function main(): Promise<void> {
  const batch = await nextBatch();
  console.log(`[cardh-migrate] using batch ${batch}`);
  const name = "20260504000005_location_notification_config.ts";
  const r = await db.raw(`SELECT to_regclass('public.location_notification_config') AS oid`);
  const exists = !!r.rows[0].oid;
  if (exists) {
    console.log(`[cardh-migrate] ${name} → table already exists, applying scope-additions only if needed`);
  }
  await upH(db);
  const tracked = await db("knex_migrations").where({ name }).first();
  if (!tracked) {
    await db("knex_migrations").insert({ name, batch, migration_time: new Date() });
    console.log(`[cardh-migrate]   tracked in knex_migrations`);
  } else {
    console.log(`[cardh-migrate]   already tracked`);
  }

  // Seed empty config rows for 1Endo's locations (orgs 39 + 47) so Feras
  // can fill them in via the Settings UI without writing the rows
  // himself. Three notification_types per location.
  const locs = await db("locations")
    .whereIn("organization_id", [39, 47])
    .select("id", "name", "organization_id");
  console.log(`[cardh-migrate] seeding empty config for ${locs.length} 1Endo locations`);
  for (const loc of locs) {
    for (const nt of ["form_submission", "referral_received", "review_alert"]) {
      await db.raw(
        `INSERT INTO location_notification_config (location_id, notification_type, email_addresses)
         VALUES (?, ?, ?::text[])
         ON CONFLICT (location_id, notification_type) DO NOTHING`,
        [loc.id, nt, []],
      );
    }
  }

  // Verify
  const counts = await db("location_notification_config")
    .count<{ count: string }[]>("id as count")
    .first();
  console.log(`[cardh-migrate] location_notification_config rows: ${counts?.count}`);
  const idxR = await db.raw(
    `SELECT indexname FROM pg_indexes
     WHERE tablename = 'location_notification_config' AND indexname = 'idx_location_notification_config_lookup'`,
  );
  console.log(
    `[cardh-migrate] composite unique index present: ${idxR.rows.length > 0}`,
  );
  const formCol = await db.raw(
    `SELECT column_name FROM information_schema.columns
       WHERE table_schema='website_builder' AND table_name='form_submissions' AND column_name='location_id'`,
  );
  console.log(
    `[cardh-migrate] website_builder.form_submissions.location_id present: ${formCol.rows.length > 0}`,
  );
}

main()
  .catch((err) => {
    console.error("[cardh-migrate] FAILED:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.destroy();
  });
