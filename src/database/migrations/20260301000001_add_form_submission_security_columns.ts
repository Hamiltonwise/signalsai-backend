import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE website_builder.form_submissions
      ADD COLUMN IF NOT EXISTS sender_ip VARCHAR(45),
      ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);

    CREATE INDEX IF NOT EXISTS idx_form_submissions_sender_ip_submitted_at
      ON website_builder.form_submissions(sender_ip, submitted_at DESC);

    CREATE INDEX IF NOT EXISTS idx_form_submissions_content_hash_submitted_at
      ON website_builder.form_submissions(content_hash, submitted_at DESC);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP INDEX IF EXISTS website_builder.idx_form_submissions_content_hash_submitted_at;
    DROP INDEX IF EXISTS website_builder.idx_form_submissions_sender_ip_submitted_at;
    ALTER TABLE website_builder.form_submissions
      DROP COLUMN IF EXISTS sender_ip,
      DROP COLUMN IF EXISTS content_hash;
  `);
}
