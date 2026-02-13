import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE website_builder.pages
    ADD COLUMN IF NOT EXISTS edit_chat_history JSONB DEFAULT '{}';
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE website_builder.pages
    DROP COLUMN IF EXISTS edit_chat_history;
  `);
}
