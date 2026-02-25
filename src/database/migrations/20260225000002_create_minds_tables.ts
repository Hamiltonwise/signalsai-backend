import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    // 1. minds.minds — core entity
    await trx.raw(`
      CREATE TABLE minds.minds (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL UNIQUE,
        personality_prompt TEXT NOT NULL DEFAULT '',
        published_version_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // 2. minds.mind_versions — immutable brain snapshots
    await trx.raw(`
      CREATE TABLE minds.mind_versions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        mind_id UUID NOT NULL REFERENCES minds.minds(id) ON DELETE CASCADE,
        version_number INT NOT NULL,
        brain_markdown TEXT NOT NULL,
        created_by_admin_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (mind_id, version_number)
      )
    `);

    // Add FK from minds.published_version_id -> mind_versions.id
    await trx.raw(`
      ALTER TABLE minds.minds
        ADD CONSTRAINT fk_minds_published_version
        FOREIGN KEY (published_version_id)
        REFERENCES minds.mind_versions(id)
        ON DELETE SET NULL
    `);
    await trx.raw(`CREATE INDEX idx_minds_published_version ON minds.minds(published_version_id)`);

    // 3. minds.mind_sources — discovery source URLs
    await trx.raw(`
      CREATE TABLE minds.mind_sources (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        mind_id UUID NOT NULL REFERENCES minds.minds(id) ON DELETE CASCADE,
        name TEXT,
        url TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (mind_id, url)
      )
    `);

    // 4. minds.mind_discovery_batches — one open batch per mind
    await trx.raw(`
      CREATE TABLE minds.mind_discovery_batches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        mind_id UUID NOT NULL REFERENCES minds.minds(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
        opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        closed_at TIMESTAMPTZ
      )
    `);
    // Partial unique index: only one open batch per mind
    await trx.raw(`
      CREATE UNIQUE INDEX idx_mind_discovery_batches_one_open
        ON minds.mind_discovery_batches (mind_id)
        WHERE status = 'open'
    `);

    // 5. minds.mind_sync_runs — background job executions
    await trx.raw(`
      CREATE TABLE minds.mind_sync_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        mind_id UUID NOT NULL REFERENCES minds.minds(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('scrape_compare', 'compile_publish')),
        status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'failed', 'completed')),
        created_by_admin_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        started_at TIMESTAMPTZ,
        finished_at TIMESTAMPTZ,
        error_message TEXT
      )
    `);
    await trx.raw(`CREATE INDEX idx_mind_sync_runs_mind_status ON minds.mind_sync_runs(mind_id, status, created_at)`);
    // Partial unique: only one queued/running run per mind
    await trx.raw(`
      CREATE UNIQUE INDEX idx_mind_sync_runs_one_active
        ON minds.mind_sync_runs (mind_id)
        WHERE status IN ('queued', 'running')
    `);

    // 6. minds.mind_discovered_posts — blog post URLs to triage
    await trx.raw(`
      CREATE TABLE minds.mind_discovered_posts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        mind_id UUID NOT NULL REFERENCES minds.minds(id) ON DELETE CASCADE,
        source_id UUID NOT NULL REFERENCES minds.mind_sources(id) ON DELETE CASCADE,
        batch_id UUID NOT NULL REFERENCES minds.mind_discovery_batches(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        title TEXT,
        published_at TIMESTAMPTZ,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'ignored', 'processed')),
        discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processed_at TIMESTAMPTZ,
        last_error TEXT,
        sync_run_id UUID REFERENCES minds.mind_sync_runs(id) ON DELETE SET NULL,
        UNIQUE (mind_id, url)
      )
    `);
    await trx.raw(`CREATE INDEX idx_mind_discovered_posts_batch ON minds.mind_discovered_posts(mind_id, batch_id, status)`);
    await trx.raw(`CREATE INDEX idx_mind_discovered_posts_run ON minds.mind_discovered_posts(sync_run_id)`);

    // 7. minds.mind_scraped_posts — extracted markdown for audit
    await trx.raw(`
      CREATE TABLE minds.mind_scraped_posts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        mind_id UUID NOT NULL REFERENCES minds.minds(id) ON DELETE CASCADE,
        source_id UUID NOT NULL REFERENCES minds.mind_sources(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        title TEXT,
        raw_html_hash TEXT,
        markdown_content TEXT NOT NULL,
        scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        sync_run_id UUID NOT NULL REFERENCES minds.mind_sync_runs(id) ON DELETE CASCADE,
        UNIQUE (mind_id, url)
      )
    `);

    // 8. minds.mind_sync_steps — linear pipeline steps with logs
    await trx.raw(`
      CREATE TABLE minds.mind_sync_steps (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sync_run_id UUID NOT NULL REFERENCES minds.mind_sync_runs(id) ON DELETE CASCADE,
        step_order INT NOT NULL,
        step_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
        log_output TEXT NOT NULL DEFAULT '',
        started_at TIMESTAMPTZ,
        finished_at TIMESTAMPTZ,
        error_message TEXT,
        UNIQUE (sync_run_id, step_order),
        UNIQUE (sync_run_id, step_name)
      )
    `);

    // 9. minds.mind_sync_proposals — LLM-generated proposals
    await trx.raw(`
      CREATE TABLE minds.mind_sync_proposals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sync_run_id UUID NOT NULL REFERENCES minds.mind_sync_runs(id) ON DELETE CASCADE,
        mind_id UUID NOT NULL REFERENCES minds.minds(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('NEW', 'UPDATE', 'CONFLICT')),
        summary TEXT NOT NULL,
        target_excerpt TEXT,
        proposed_text TEXT NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'finalized')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await trx.raw(`CREATE INDEX idx_mind_proposals_mind_run ON minds.mind_sync_proposals(mind_id, sync_run_id, status)`);
    await trx.raw(`CREATE INDEX idx_mind_proposals_run ON minds.mind_sync_proposals(sync_run_id, status)`);

    // 10. minds.mind_conversations — chat sessions
    await trx.raw(`
      CREATE TABLE minds.mind_conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        mind_id UUID NOT NULL REFERENCES minds.minds(id) ON DELETE CASCADE,
        created_by_admin_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // 11. minds.mind_messages — chat messages
    await trx.raw(`
      CREATE TABLE minds.mind_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES minds.mind_conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await trx.raw(`CREATE INDEX idx_mind_messages_conv ON minds.mind_messages(conversation_id, created_at)`);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    await trx.raw("DROP TABLE IF EXISTS minds.mind_messages CASCADE");
    await trx.raw("DROP TABLE IF EXISTS minds.mind_conversations CASCADE");
    await trx.raw("DROP TABLE IF EXISTS minds.mind_sync_proposals CASCADE");
    await trx.raw("DROP TABLE IF EXISTS minds.mind_sync_steps CASCADE");
    await trx.raw("DROP TABLE IF EXISTS minds.mind_scraped_posts CASCADE");
    await trx.raw("DROP TABLE IF EXISTS minds.mind_discovered_posts CASCADE");
    await trx.raw("DROP TABLE IF EXISTS minds.mind_sync_runs CASCADE");
    await trx.raw("DROP TABLE IF EXISTS minds.mind_discovery_batches CASCADE");
    await trx.raw("DROP TABLE IF EXISTS minds.mind_sources CASCADE");
    await trx.raw("ALTER TABLE minds.minds DROP CONSTRAINT IF EXISTS fk_minds_published_version");
    await trx.raw("DROP TABLE IF EXISTS minds.mind_versions CASCADE");
    await trx.raw("DROP TABLE IF EXISTS minds.minds CASCADE");
  });
}
