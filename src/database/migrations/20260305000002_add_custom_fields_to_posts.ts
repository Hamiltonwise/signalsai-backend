import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE website_builder.posts
    ADD COLUMN custom_fields JSONB NOT NULL DEFAULT '{}';
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE website_builder.posts
    DROP COLUMN IF EXISTS custom_fields;
  `);
}
