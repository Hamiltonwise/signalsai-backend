-- T1 — ai_cost_events: per-LLM-call cost record for the Costs tab.
-- One row per Anthropic request. Nested tool calls roll up via parent_event_id.
-- estimated_cost_usd is frozen at event time so pricing refreshes don't rewrite history.

-- project_id is nullable so non-website callers (minds-chat) can share the table.
CREATE TABLE website_builder.ai_cost_events (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id             UUID NULL REFERENCES website_builder.projects(id) ON DELETE CASCADE,
  event_type             TEXT NOT NULL, -- page-generate | section-regenerate | warmup | layouts-build | editor-chat | identity-chat | critic | seo-generation | select-image-tool | minds-chat
  vendor                 TEXT NOT NULL DEFAULT 'anthropic',
  model                  TEXT NOT NULL,
  input_tokens           INTEGER NOT NULL DEFAULT 0,
  output_tokens          INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens  INTEGER,
  cache_read_tokens      INTEGER,
  estimated_cost_usd     NUMERIC(10,6) NOT NULL DEFAULT 0,
  metadata               JSONB,
  parent_event_id        UUID REFERENCES website_builder.ai_cost_events(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_cost_events_project_created ON website_builder.ai_cost_events (project_id, created_at DESC);
CREATE INDEX idx_ai_cost_events_parent ON website_builder.ai_cost_events (parent_event_id) WHERE parent_event_id IS NOT NULL;
