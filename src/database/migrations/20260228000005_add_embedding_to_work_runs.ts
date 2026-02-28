import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE minds.skill_work_runs
      ADD COLUMN embedding vector(1536)
  `);

  await knex.raw(`
    CREATE INDEX idx_skill_work_runs_embedding
      ON minds.skill_work_runs
      USING hnsw (embedding vector_cosine_ops)
      WHERE embedding IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS minds.idx_skill_work_runs_embedding`);
  await knex.raw(`ALTER TABLE minds.skill_work_runs DROP COLUMN IF EXISTS embedding`);
}
