import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE website_builder.page_generation_status AS ENUM (
        'queued', 'generating', 'ready', 'failed'
      );
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await knex.raw(`
    ALTER TABLE website_builder.pages
      ADD COLUMN IF NOT EXISTS generation_status website_builder.page_generation_status DEFAULT NULL;

    ALTER TABLE website_builder.pages
      ADD COLUMN IF NOT EXISTS template_page_id UUID REFERENCES website_builder.template_pages(id) ON DELETE SET NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE website_builder.pages
      DROP COLUMN IF EXISTS template_page_id;

    ALTER TABLE website_builder.pages
      DROP COLUMN IF EXISTS generation_status;
  `);

  await knex.raw(`DROP TYPE IF EXISTS website_builder.page_generation_status;`);
}
