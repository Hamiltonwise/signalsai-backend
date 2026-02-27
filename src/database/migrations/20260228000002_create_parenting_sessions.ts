import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    // Parenting sessions
    await trx.raw(`
      CREATE TABLE minds.mind_parenting_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        mind_id UUID NOT NULL REFERENCES minds.minds(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'chatting'
          CHECK (status IN ('chatting', 'reading', 'proposals', 'compiling', 'completed', 'abandoned')),
        result TEXT CHECK (result IN ('learned', 'no_changes', 'all_rejected')),
        knowledge_buffer TEXT NOT NULL DEFAULT '',
        sync_run_id UUID REFERENCES minds.mind_sync_runs(id) ON DELETE SET NULL,
        created_by_admin_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        finished_at TIMESTAMPTZ
      )
    `);

    await trx.raw(`
      CREATE INDEX idx_parenting_sessions_mind
        ON minds.mind_parenting_sessions(mind_id, status)
    `);

    // Parenting messages
    await trx.raw(`
      CREATE TABLE minds.mind_parenting_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL REFERENCES minds.mind_parenting_sessions(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await trx.raw(`
      CREATE INDEX idx_parenting_messages_session
        ON minds.mind_parenting_messages(session_id, created_at)
    `);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP TABLE IF EXISTS minds.mind_parenting_messages CASCADE");
  await knex.raw("DROP TABLE IF EXISTS minds.mind_parenting_sessions CASCADE");
}
