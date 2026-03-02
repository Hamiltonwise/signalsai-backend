import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE website_builder.form_submissions
      ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS flag_reason TEXT;

    CREATE INDEX IF NOT EXISTS idx_form_submissions_is_flagged
      ON website_builder.form_submissions(is_flagged);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP INDEX IF EXISTS website_builder.idx_form_submissions_is_flagged;
    ALTER TABLE website_builder.form_submissions
      DROP COLUMN IF EXISTS is_flagged,
      DROP COLUMN IF EXISTS flag_reason;
  `);
}
