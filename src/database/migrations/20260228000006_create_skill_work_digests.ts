import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE minds.skill_work_digests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      skill_id UUID NOT NULL REFERENCES minds.mind_skills(id) ON DELETE CASCADE,
      summary TEXT NOT NULL,
      covers_from TIMESTAMPTZ NOT NULL,
      covers_to TIMESTAMPTZ NOT NULL,
      work_count INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_skill_work_digests_skill_id
      ON minds.skill_work_digests(skill_id);
  `);

  await knex.raw(`
    ALTER TABLE minds.skill_work_runs
      ADD COLUMN digest_batch_id UUID REFERENCES minds.skill_work_digests(id) ON DELETE SET NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE minds.skill_work_runs DROP COLUMN IF EXISTS digest_batch_id`);
  await knex.raw(`DROP TABLE IF EXISTS minds.skill_work_digests CASCADE`);
}
