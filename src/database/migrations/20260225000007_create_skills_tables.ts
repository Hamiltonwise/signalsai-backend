import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    // mind_skills
    await trx.raw(`
      CREATE TABLE minds.mind_skills (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        mind_id UUID NOT NULL REFERENCES minds.minds(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        definition TEXT NOT NULL DEFAULT '',
        output_schema JSONB,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'generating', 'failed')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (mind_id, slug)
      )
    `);
    await trx.raw(`CREATE INDEX idx_mind_skills_mind_id ON minds.mind_skills(mind_id)`);

    // mind_skill_neurons — one active neuron per skill
    await trx.raw(`
      CREATE TABLE minds.mind_skill_neurons (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        skill_id UUID NOT NULL UNIQUE REFERENCES minds.mind_skills(id) ON DELETE CASCADE,
        mind_version_id UUID NOT NULL REFERENCES minds.mind_versions(id) ON DELETE CASCADE,
        neuron_markdown TEXT NOT NULL,
        generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // mind_skill_calls — analytics / call log
    await trx.raw(`
      CREATE TABLE minds.mind_skill_calls (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        skill_id UUID NOT NULL REFERENCES minds.mind_skills(id) ON DELETE CASCADE,
        caller_ip TEXT,
        request_payload JSONB,
        response_payload JSONB,
        status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error')),
        duration_ms INTEGER NOT NULL DEFAULT 0,
        called_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await trx.raw(`CREATE INDEX idx_mind_skill_calls_skill_date ON minds.mind_skill_calls(skill_id, called_at DESC)`);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS minds.mind_skill_calls CASCADE`);
  await knex.raw(`DROP TABLE IF EXISTS minds.mind_skill_neurons CASCADE`);
  await knex.raw(`DROP TABLE IF EXISTS minds.mind_skills CASCADE`);
}
