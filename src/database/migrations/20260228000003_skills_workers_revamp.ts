import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    // 1a. Revamp minds.mind_skills — add new columns
    await trx.raw(`
      ALTER TABLE minds.mind_skills
        ADD COLUMN work_creation_type TEXT,
        ADD COLUMN output_count INTEGER DEFAULT 1,
        ADD COLUMN trigger_type TEXT DEFAULT 'manual',
        ADD COLUMN trigger_config JSONB DEFAULT '{}',
        ADD COLUMN pipeline_mode TEXT DEFAULT 'review_and_stop',
        ADD COLUMN work_publish_to TEXT,
        ADD COLUMN publication_config JSONB DEFAULT '{}',
        ADD COLUMN portal_key_hash TEXT,
        ADD COLUMN last_run_at TIMESTAMPTZ,
        ADD COLUMN next_run_at TIMESTAMPTZ,
        ADD COLUMN org_id UUID
    `);

    // Update status check constraint to include 'active' and 'paused'
    await trx.raw(`
      ALTER TABLE minds.mind_skills
        DROP CONSTRAINT IF EXISTS mind_skills_status_check
    `);
    await trx.raw(`
      ALTER TABLE minds.mind_skills
        ADD CONSTRAINT mind_skills_status_check
        CHECK (status IN ('draft', 'ready', 'active', 'paused', 'generating', 'failed'))
    `);

    // 1b. Create minds.skill_work_runs table
    await trx.raw(`
      CREATE TABLE minds.skill_work_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        skill_id UUID NOT NULL REFERENCES minds.mind_skills(id) ON DELETE CASCADE,
        triggered_by TEXT NOT NULL,
        triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN (
            'pending', 'running', 'consulting', 'creating',
            'awaiting_review', 'approved', 'rejected',
            'publishing', 'published', 'failed'
          )),
        artifact_type TEXT,
        artifact_url TEXT,
        artifact_content TEXT,
        title TEXT,
        description TEXT,
        approved_by_admin_id UUID,
        approved_at TIMESTAMPTZ,
        rejection_category TEXT,
        rejection_reason TEXT,
        rejected_by_admin_id UUID,
        rejected_at TIMESTAMPTZ,
        published_at TIMESTAMPTZ,
        publication_url TEXT,
        n8n_run_id TEXT,
        error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await trx.raw(`
      CREATE INDEX idx_skill_work_runs_skill_id
        ON minds.skill_work_runs(skill_id)
    `);
    await trx.raw(`
      CREATE INDEX idx_skill_work_runs_status
        ON minds.skill_work_runs(status)
    `);

    // 1c. Add Mind-level configuration columns
    await trx.raw(`
      ALTER TABLE minds.minds
        ADD COLUMN available_work_types JSONB DEFAULT '["text", "markdown"]',
        ADD COLUMN available_publish_targets JSONB DEFAULT '["internal_only"]',
        ADD COLUMN rejection_categories JSONB DEFAULT '["too_similar", "wrong_tone", "off_brand", "factually_incorrect", "wrong_format", "topic_not_relevant", "too_generic"]',
        ADD COLUMN portal_key_hash TEXT
    `);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    // Remove mind columns
    await trx.raw(`
      ALTER TABLE minds.minds
        DROP COLUMN IF EXISTS available_work_types,
        DROP COLUMN IF EXISTS available_publish_targets,
        DROP COLUMN IF EXISTS rejection_categories,
        DROP COLUMN IF EXISTS portal_key_hash
    `);

    // Drop work_runs table
    await trx.raw(`DROP TABLE IF EXISTS minds.skill_work_runs CASCADE`);

    // Remove skill columns
    await trx.raw(`
      ALTER TABLE minds.mind_skills
        DROP COLUMN IF EXISTS work_creation_type,
        DROP COLUMN IF EXISTS output_count,
        DROP COLUMN IF EXISTS trigger_type,
        DROP COLUMN IF EXISTS trigger_config,
        DROP COLUMN IF EXISTS pipeline_mode,
        DROP COLUMN IF EXISTS work_publish_to,
        DROP COLUMN IF EXISTS publication_config,
        DROP COLUMN IF EXISTS portal_key_hash,
        DROP COLUMN IF EXISTS last_run_at,
        DROP COLUMN IF EXISTS next_run_at,
        DROP COLUMN IF EXISTS org_id
    `);

    // Restore original status constraint
    await trx.raw(`
      ALTER TABLE minds.mind_skills
        DROP CONSTRAINT IF EXISTS mind_skills_status_check
    `);
    await trx.raw(`
      ALTER TABLE minds.mind_skills
        ADD CONSTRAINT mind_skills_status_check
        CHECK (status IN ('draft', 'ready', 'generating', 'failed'))
    `);
  });
}
