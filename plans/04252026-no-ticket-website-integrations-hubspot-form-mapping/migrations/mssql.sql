-- Migration: Website Integrations (HubSpot Form-to-Contact Mapping v1)
-- Target: Microsoft SQL Server
-- Note: Alloro production runs PostgreSQL exclusively. This file exists per spec
--       convention. If/when SQL Server support is added, replace pgsql-specific
--       types (UUID → UNIQUEIDENTIFIER, JSONB → NVARCHAR(MAX), TIMESTAMPTZ →
--       DATETIMEOFFSET, gen_random_uuid() → NEWID()).
--
-- TODO: fill during execution if SQL Server target becomes required. For v1
--       this file is a placeholder and is NOT executed during the rollout.

-- Equivalent table definitions (translated):

CREATE SCHEMA website_builder;
GO

CREATE TABLE website_builder.website_integrations (
    id                    UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    project_id            UNIQUEIDENTIFIER NOT NULL,
    platform              NVARCHAR(255) NOT NULL,
    label                 NVARCHAR(255) NULL,
    encrypted_credentials NVARCHAR(MAX) NOT NULL,
    metadata              NVARCHAR(MAX) NOT NULL DEFAULT '{}',  -- JSON stored as NVARCHAR
    status                NVARCHAR(50) NOT NULL DEFAULT 'active',
    last_validated_at     DATETIMEOFFSET NULL,
    last_error            NVARCHAR(MAX) NULL,
    created_at            DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    updated_at            DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),

    CONSTRAINT FK_website_integrations_project
        FOREIGN KEY (project_id) REFERENCES website_builder.projects(id) ON DELETE CASCADE,
    CONSTRAINT CHK_website_integrations_status
        CHECK (status IN ('active', 'revoked', 'broken')),
    CONSTRAINT UQ_website_integrations_project_platform
        UNIQUE (project_id, platform)
);

-- TODO: indexes, mappings table, and crm_sync_logs table — translate from pgsql.sql
--       when MSSQL support is required.
