import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    -- templates: replace html_template with wrapper/header/footer
    ALTER TABLE website_builder.templates
      ADD COLUMN IF NOT EXISTS wrapper TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS header TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS footer TEXT NOT NULL DEFAULT '';

    ALTER TABLE website_builder.templates
      DROP COLUMN IF EXISTS html_template;

    -- template_pages: replace html_template with sections JSONB
    ALTER TABLE website_builder.template_pages
      ADD COLUMN IF NOT EXISTS sections JSONB NOT NULL DEFAULT '[]';

    ALTER TABLE website_builder.template_pages
      DROP COLUMN IF EXISTS html_template;

    -- projects: add wrapper/header/footer
    ALTER TABLE website_builder.projects
      ADD COLUMN IF NOT EXISTS wrapper TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS header TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS footer TEXT NOT NULL DEFAULT '';

    -- pages: replace html_content with sections JSONB
    ALTER TABLE website_builder.pages
      ADD COLUMN IF NOT EXISTS sections JSONB NOT NULL DEFAULT '[]';

    ALTER TABLE website_builder.pages
      DROP COLUMN IF EXISTS html_content;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    -- pages: restore html_content, drop sections
    ALTER TABLE website_builder.pages
      ADD COLUMN IF NOT EXISTS html_content TEXT;

    ALTER TABLE website_builder.pages
      DROP COLUMN IF EXISTS sections;

    -- projects: drop wrapper/header/footer
    ALTER TABLE website_builder.projects
      DROP COLUMN IF EXISTS wrapper,
      DROP COLUMN IF EXISTS header,
      DROP COLUMN IF EXISTS footer;

    -- template_pages: restore html_template, drop sections
    ALTER TABLE website_builder.template_pages
      ADD COLUMN IF NOT EXISTS html_template TEXT NOT NULL DEFAULT '';

    ALTER TABLE website_builder.template_pages
      DROP COLUMN IF EXISTS sections;

    -- templates: restore html_template, drop wrapper/header/footer
    ALTER TABLE website_builder.templates
      ADD COLUMN IF NOT EXISTS html_template TEXT;

    ALTER TABLE website_builder.templates
      DROP COLUMN IF EXISTS wrapper,
      DROP COLUMN IF EXISTS header,
      DROP COLUMN IF EXISTS footer;
  `);
}
