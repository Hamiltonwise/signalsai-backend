import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    // 1. Create publish_channels table (global, not per-mind)
    await trx.raw(`
      CREATE TABLE minds.publish_channels (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        webhook_url TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // 2. Add publish_channel_id to mind_skills
    await trx.raw(`
      ALTER TABLE minds.mind_skills
        ADD COLUMN publish_channel_id UUID REFERENCES minds.publish_channels(id) ON DELETE SET NULL
    `);

    // 3. Drop old publish columns from mind_skills
    await trx.raw(`
      ALTER TABLE minds.mind_skills
        DROP COLUMN IF EXISTS work_publish_to,
        DROP COLUMN IF EXISTS publication_config
    `);

    // 4. Drop available_publish_targets from minds
    await trx.raw(`
      ALTER TABLE minds.minds
        DROP COLUMN IF EXISTS available_publish_targets
    `);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    // Restore old columns
    await trx.raw(`
      ALTER TABLE minds.minds
        ADD COLUMN available_publish_targets JSONB DEFAULT '["internal_only"]'
    `);

    await trx.raw(`
      ALTER TABLE minds.mind_skills
        ADD COLUMN work_publish_to TEXT,
        ADD COLUMN publication_config JSONB DEFAULT '{}'
    `);

    await trx.raw(`
      ALTER TABLE minds.mind_skills
        DROP COLUMN IF EXISTS publish_channel_id
    `);

    await trx.raw(`DROP TABLE IF EXISTS minds.publish_channels CASCADE`);
  });
}
