import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    // Drop the mind_id index and column — channels are now global
    await trx.raw(`
      DROP INDEX IF EXISTS minds.idx_publish_channels_mind_id
    `);
    await trx.raw(`
      ALTER TABLE minds.publish_channels
        DROP COLUMN IF EXISTS mind_id
    `);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    await trx.raw(`
      ALTER TABLE minds.publish_channels
        ADD COLUMN mind_id UUID REFERENCES minds.minds(id) ON DELETE CASCADE
    `);
    await trx.raw(`
      CREATE INDEX idx_publish_channels_mind_id
        ON minds.publish_channels(mind_id)
    `);
  });
}
