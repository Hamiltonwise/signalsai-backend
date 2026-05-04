import type { Knex } from "knex";

/**
 * Add `hidden` boolean to website_builder.reviews so admins can
 * hide individual reviews from shortcode rendering without deleting them.
 */

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE website_builder.reviews
      ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT FALSE
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE website_builder.reviews
      DROP COLUMN IF EXISTS hidden
  `);
}
