import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS website_builder.template_pages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      template_id UUID NOT NULL REFERENCES website_builder.templates(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      html_template TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_template_pages_template_id
      ON website_builder.template_pages(template_id);

    ALTER TABLE website_builder.projects
      ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES website_builder.templates(id) ON DELETE SET NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE website_builder.projects DROP COLUMN IF EXISTS template_id;
    DROP TABLE IF EXISTS website_builder.template_pages;
  `);
}
