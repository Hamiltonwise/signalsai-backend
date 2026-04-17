import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Add 'cancelled' to the generation_status enum
  await knex.raw(`
    ALTER TYPE website_builder.page_generation_status ADD VALUE IF NOT EXISTS 'cancelled';
  `);

  // Add generation_progress JSONB column on pages
  // Shape: { total: number, completed: number, current_component: string }
  await knex.raw(`
    ALTER TABLE website_builder.pages
      ADD COLUMN IF NOT EXISTS generation_progress JSONB DEFAULT NULL;
  `);

  // Add cancel flag on projects
  await knex.raw(`
    ALTER TABLE website_builder.projects
      ADD COLUMN IF NOT EXISTS generation_cancel_requested BOOLEAN DEFAULT FALSE;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE website_builder.projects
      DROP COLUMN IF EXISTS generation_cancel_requested;
  `);

  await knex.raw(`
    ALTER TABLE website_builder.pages
      DROP COLUMN IF EXISTS generation_progress;
  `);

  // Note: cannot remove an enum value in PostgreSQL without recreating the type.
  // 'cancelled' value left in place on rollback.
}
