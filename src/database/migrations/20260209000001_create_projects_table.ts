import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Create the project_status enum if it doesn't exist
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE website_builder.project_status AS ENUM (
        'CREATED', 'GBP_SELECTED', 'GBP_SCRAPED', 'WEBSITE_SCRAPED',
        'IMAGES_ANALYZED', 'HTML_GENERATED', 'READY'
      );
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS website_builder.projects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(255),
      generated_hostname VARCHAR(255) UNIQUE,
      status website_builder.project_status DEFAULT 'CREATED',
      selected_place_id TEXT,
      selected_website_url TEXT,
      step_gbp_scrape JSONB,
      step_website_scrape JSONB,
      step_image_analysis JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS website_builder.projects;`);
  await knex.raw(`DROP TYPE IF EXISTS website_builder.project_status;`);
}
