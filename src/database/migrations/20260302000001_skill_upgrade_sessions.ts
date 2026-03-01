import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    await trx.raw(`
      CREATE TABLE minds.skill_upgrade_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        skill_id UUID NOT NULL REFERENCES minds.mind_skills(id) ON DELETE CASCADE,
        mind_id UUID NOT NULL REFERENCES minds.minds(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'chatting'
          CHECK (status IN ('chatting', 'reading', 'proposals', 'compiling', 'completed', 'abandoned')),
        result TEXT CHECK (result IN ('learned', 'no_changes', 'all_rejected')),
        title TEXT,
        knowledge_buffer TEXT DEFAULT '',
        sync_run_id UUID REFERENCES minds.mind_sync_runs(id),
        created_by_admin_id UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        finished_at TIMESTAMPTZ
      )
    `);

    await trx.raw(`
      CREATE INDEX idx_skill_upgrade_sessions_skill_id
        ON minds.skill_upgrade_sessions(skill_id)
    `);

    await trx.raw(`
      CREATE TABLE minds.skill_upgrade_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL REFERENCES minds.skill_upgrade_sessions(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await trx.raw(`
      CREATE INDEX idx_skill_upgrade_messages_session_id
        ON minds.skill_upgrade_messages(session_id)
    `);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP TABLE IF EXISTS minds.skill_upgrade_messages CASCADE");
  await knex.raw("DROP TABLE IF EXISTS minds.skill_upgrade_sessions CASCADE");
}
