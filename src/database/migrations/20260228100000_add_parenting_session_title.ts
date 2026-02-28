import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE minds.mind_parenting_sessions
    ADD COLUMN title TEXT
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE minds.mind_parenting_sessions
    DROP COLUMN IF EXISTS title
  `);
}
