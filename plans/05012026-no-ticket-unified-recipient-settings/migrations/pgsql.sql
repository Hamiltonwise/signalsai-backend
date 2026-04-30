-- Unified Recipient Settings
-- PostgreSQL execution script.

CREATE TABLE IF NOT EXISTS organization_recipient_settings (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel VARCHAR(64) NOT NULL,
  recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uniq_org_recipient_channel UNIQUE (organization_id, channel),
  CONSTRAINT organization_recipient_settings_channel_check
    CHECK (channel IN ('website_form', 'agent_notifications'))
);

CREATE INDEX IF NOT EXISTS idx_org_recipient_settings_org
  ON organization_recipient_settings (organization_id);

INSERT INTO organization_recipient_settings
  (organization_id, channel, recipients, created_at, updated_at)
SELECT DISTINCT ON (organization_id)
  organization_id,
  'website_form',
  CASE
    WHEN jsonb_typeof(recipients) = 'array' THEN recipients
    ELSE '[]'::jsonb
  END,
  NOW(),
  NOW()
FROM website_builder.projects
WHERE organization_id IS NOT NULL
ORDER BY organization_id, updated_at DESC
ON CONFLICT (organization_id, channel) DO NOTHING;

-- Rollback:
-- DROP TABLE IF EXISTS organization_recipient_settings;
