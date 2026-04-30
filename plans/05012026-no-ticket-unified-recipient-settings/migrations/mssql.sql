-- Unified Recipient Settings
-- Microsoft SQL Server execution script.

IF OBJECT_ID(N'dbo.organization_recipient_settings', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.organization_recipient_settings (
    id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    organization_id BIGINT NOT NULL,
    channel NVARCHAR(64) NOT NULL,
    recipients NVARCHAR(MAX) NOT NULL
      CONSTRAINT df_org_recipient_settings_recipients DEFAULT N'[]',
    created_at DATETIMEOFFSET NOT NULL
      CONSTRAINT df_org_recipient_settings_created_at DEFAULT SYSDATETIMEOFFSET(),
    updated_at DATETIMEOFFSET NOT NULL
      CONSTRAINT df_org_recipient_settings_updated_at DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT fk_org_recipient_settings_org
      FOREIGN KEY (organization_id) REFERENCES dbo.organizations(id) ON DELETE CASCADE,
    CONSTRAINT uq_org_recipient_settings_org_channel
      UNIQUE (organization_id, channel),
    CONSTRAINT ck_org_recipient_settings_channel
      CHECK (channel IN (N'website_form', N'agent_notifications')),
    CONSTRAINT ck_org_recipient_settings_recipients_json
      CHECK (ISJSON(recipients) = 1)
  );

  CREATE INDEX ix_org_recipient_settings_org
    ON dbo.organization_recipient_settings (organization_id);
END;

;WITH latest_project AS (
  SELECT
    organization_id,
    CASE
      WHEN ISJSON(recipients) = 1 THEN recipients
      ELSE N'[]'
    END AS recipients,
    ROW_NUMBER() OVER (
      PARTITION BY organization_id
      ORDER BY updated_at DESC
    ) AS row_number
  FROM website_builder.projects
  WHERE organization_id IS NOT NULL
)
INSERT INTO dbo.organization_recipient_settings
  (organization_id, channel, recipients, created_at, updated_at)
SELECT
  latest_project.organization_id,
  N'website_form',
  latest_project.recipients,
  SYSDATETIMEOFFSET(),
  SYSDATETIMEOFFSET()
FROM latest_project
WHERE latest_project.row_number = 1
  AND NOT EXISTS (
    SELECT 1
    FROM dbo.organization_recipient_settings existing
    WHERE existing.organization_id = latest_project.organization_id
      AND existing.channel = N'website_form'
  );

-- Rollback:
-- DROP TABLE IF EXISTS dbo.organization_recipient_settings;
