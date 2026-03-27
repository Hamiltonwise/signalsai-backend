-- AI Command tables for batch analysis and recommendations
-- Schema: website_builder

CREATE TABLE IF NOT EXISTS website_builder.ai_command_batches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES website_builder.projects(id) ON DELETE CASCADE,
  prompt        TEXT NOT NULL,
  targets       JSONB NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'analyzing'
                CHECK (status IN ('analyzing', 'ready', 'executing', 'completed', 'failed')),
  summary       TEXT,
  stats         JSONB NOT NULL DEFAULT '{"total":0,"pending":0,"approved":0,"rejected":0,"executed":0,"failed":0}',
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS website_builder.ai_command_recommendations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id        UUID NOT NULL REFERENCES website_builder.ai_command_batches(id) ON DELETE CASCADE,
  target_type     TEXT NOT NULL CHECK (target_type IN ('page_section', 'layout', 'post')),
  target_id       UUID NOT NULL,
  target_label    TEXT NOT NULL,
  target_meta     JSONB NOT NULL DEFAULT '{}',
  recommendation  TEXT NOT NULL,
  instruction     TEXT NOT NULL,
  current_html    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'failed')),
  execution_result JSONB,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_cmd_rec_batch ON website_builder.ai_command_recommendations(batch_id);
CREATE INDEX idx_ai_cmd_rec_batch_status ON website_builder.ai_command_recommendations(batch_id, status);
CREATE INDEX idx_ai_cmd_rec_target ON website_builder.ai_command_recommendations(target_type, target_id);
