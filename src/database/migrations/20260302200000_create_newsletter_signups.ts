import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS website_builder.newsletter_signups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES website_builder.projects(id) ON DELETE CASCADE,
      email VARCHAR(320) NOT NULL,
      token UUID NOT NULL DEFAULT gen_random_uuid(),
      confirmed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(project_id, email)
    );

    CREATE INDEX IF NOT EXISTS idx_newsletter_signups_token
      ON website_builder.newsletter_signups(token);

    CREATE INDEX IF NOT EXISTS idx_newsletter_signups_project_email
      ON website_builder.newsletter_signups(project_id, email);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP TABLE IF EXISTS website_builder.newsletter_signups;
  `);
}
