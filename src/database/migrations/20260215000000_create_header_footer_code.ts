import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS website_builder.header_footer_code (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      template_id UUID REFERENCES website_builder.templates(id) ON DELETE CASCADE,
      project_id UUID REFERENCES website_builder.projects(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      location VARCHAR(20) NOT NULL CHECK (location IN ('head_start', 'head_end', 'body_start', 'body_end')),
      code TEXT NOT NULL,
      is_enabled BOOLEAN NOT NULL DEFAULT true,
      order_index INTEGER NOT NULL DEFAULT 0,
      page_ids JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (
        (template_id IS NOT NULL AND project_id IS NULL) OR
        (template_id IS NULL AND project_id IS NOT NULL)
      )
    );

    CREATE INDEX IF NOT EXISTS idx_hfc_template
      ON website_builder.header_footer_code(template_id)
      WHERE template_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_hfc_project
      ON website_builder.header_footer_code(project_id)
      WHERE project_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_hfc_location
      ON website_builder.header_footer_code(location);

    CREATE INDEX IF NOT EXISTS idx_hfc_enabled
      ON website_builder.header_footer_code(is_enabled);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS website_builder.header_footer_code;`);
}
