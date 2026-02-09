import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Create the page_status enum if it doesn't exist
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE website_builder.page_status AS ENUM ('draft', 'published', 'inactive');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS website_builder.pages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID REFERENCES website_builder.projects(id) ON DELETE CASCADE,
      path VARCHAR(255) DEFAULT '/',
      version INTEGER DEFAULT 1,
      status website_builder.page_status DEFAULT 'draft',
      html_content TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_pages_project_id
      ON website_builder.pages (project_id);

    CREATE INDEX IF NOT EXISTS idx_pages_project_path
      ON website_builder.pages (project_id, path);

    CREATE INDEX IF NOT EXISTS idx_pages_status
      ON website_builder.pages (status);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS website_builder.pages;`);
  await knex.raw(`DROP TYPE IF EXISTS website_builder.page_status;`);
}
