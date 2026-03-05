import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE website_builder.post_types
    ADD COLUMN single_template JSONB NOT NULL DEFAULT '[]';
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE website_builder.post_types
    DROP COLUMN IF EXISTS single_template;
  `);
}
