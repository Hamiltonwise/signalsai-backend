import type { Knex } from "knex";

/**
 * Card H — Per-Location Notification Routing (May 4 2026 evening).
 *
 * Creates the location_notification_config table per Card H spec, plus a
 * scope-addition: location_id column on website_builder.form_submissions
 * (the spec's CC's Action step 2 says "Read submission.location_id" but
 * the existing form_submissions schema lacks the column). Adding it
 * NULL-able lets the routing helper resolve a per-location email list
 * when present and fall back to project recipients when absent. The
 * foundation lands here; the UI to actually populate location_id at form
 * creation time is a future card (project to location association).
 *
 * Three notification_type values are supported:
 *   form_submission, referral_received, review_alert
 * The composite unique index keeps the per-(location, type) lookup fast
 * at 10,000+ practices.
 */
export async function up(knex: Knex): Promise<void> {
  // Main table per Card H spec
  const exists = await knex.raw(
    `SELECT to_regclass('public.location_notification_config') AS oid`,
  );
  if (!exists.rows[0].oid) {
    await knex.raw(`
      CREATE TABLE location_notification_config (
        id SERIAL PRIMARY KEY,
        location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
        notification_type VARCHAR(64) NOT NULL,
        email_addresses TEXT[] NOT NULL DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
  }
  await knex.raw(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_location_notification_config_lookup
       ON location_notification_config(location_id, notification_type)`,
  );

  // Scope-addition: form_submissions.location_id (NULL-able). Spec
  // assumes this column exists. Adding it now so the routing helper has
  // a place to read from once admin UIs (or project metadata) populate it.
  const hasFormCol = await knex.raw(
    `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'website_builder'
         AND table_name = 'form_submissions'
         AND column_name = 'location_id'`,
  );
  if (!hasFormCol.rows.length) {
    await knex.raw(
      `ALTER TABLE website_builder.form_submissions ADD COLUMN location_id INTEGER NULL REFERENCES locations(id)`,
    );
    await knex.raw(
      `CREATE INDEX IF NOT EXISTS idx_form_submissions_location ON website_builder.form_submissions(location_id) WHERE location_id IS NOT NULL`,
    );
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS idx_location_notification_config_lookup`);
  await knex.raw(`DROP TABLE IF EXISTS location_notification_config`);
  await knex.raw(`DROP INDEX IF EXISTS idx_form_submissions_location`);
  const hasFormCol = await knex.raw(
    `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'website_builder'
         AND table_name = 'form_submissions'
         AND column_name = 'location_id'`,
  );
  if (hasFormCol.rows.length) {
    await knex.raw(
      `ALTER TABLE website_builder.form_submissions DROP COLUMN location_id`,
    );
  }
}
