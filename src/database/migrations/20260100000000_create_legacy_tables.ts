import type { Knex } from "knex";

/**
 * Baseline migration: creates all legacy tables that existed before the Knex
 * migration system was adopted. Uses IF NOT EXISTS throughout so it is a
 * safe no-op on production databases where these tables already exist.
 *
 * Column definitions sourced from the live production pg_dump schema.
 * Only pre-migration columns are included; columns added by later
 * migrations (subscription_tier, location_id, organization_id on
 * dependent tables, etc.) are intentionally excluded.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    -- Schemas
    CREATE SCHEMA IF NOT EXISTS website_builder;
    CREATE SCHEMA IF NOT EXISTS minds;
    CREATE SCHEMA IF NOT EXISTS knowledgebase;

    -- Trigger function used by legacy tables
    CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger
      LANGUAGE plpgsql AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$;

    -- 1. users
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(255),
      password_hash TEXT,
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. otp_codes
    CREATE TABLE IF NOT EXISTS otp_codes (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      code VARCHAR(255) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- 3. organizations (baseline only; subscription/type columns added by later migrations)
    CREATE TABLE IF NOT EXISTS organizations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      domain VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- 4. organization_users (has its own serial id, not composite PK)
    CREATE TABLE IF NOT EXISTS organization_users (
      id SERIAL PRIMARY KEY,
      organization_id INTEGER,
      user_id INTEGER,
      role VARCHAR(255) NOT NULL DEFAULT 'viewer',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (organization_id, user_id)
    );

    -- 5. invitations
    CREATE TABLE IF NOT EXISTS invitations (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      organization_id INTEGER,
      role VARCHAR(255) NOT NULL DEFAULT 'viewer',
      token VARCHAR(255) NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      status VARCHAR(255) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- 6. google_accounts (renamed to google_connections by migration 20260221000004)
    CREATE TABLE IF NOT EXISTS google_accounts (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      google_user_id VARCHAR(64) NOT NULL,
      email VARCHAR(255) NOT NULL,
      refresh_token TEXT NOT NULL,
      access_token TEXT,
      token_type VARCHAR(50),
      google_property_ids JSON,
      expiry_date TIMESTAMP WITHOUT TIME ZONE,
      scopes TEXT,
      domain_name VARCHAR(255),
      practice_name VARCHAR(255),
      phone VARCHAR(255),
      operational_jurisdiction VARCHAR(500),
      first_name VARCHAR(255),
      last_name VARCHAR(255),
      organization_id INTEGER,
      onboarding_completed BOOLEAN DEFAULT false,
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- 7. google_data_store
    CREATE TABLE IF NOT EXISTS google_data_store (
      id SERIAL PRIMARY KEY,
      google_account_id BIGINT,
      domain VARCHAR(255),
      date_start DATE,
      date_end DATE,
      run_type VARCHAR(50),
      gbp_data JSONB,
      ga4_data JSONB,
      gsc_data JSONB,
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- 8. practice_rankings
    CREATE TABLE IF NOT EXISTS practice_rankings (
      id SERIAL PRIMARY KEY,
      google_account_id INTEGER,
      domain TEXT,
      specialty VARCHAR(255) NOT NULL,
      location VARCHAR(255) NOT NULL,
      observed_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
      rank_score NUMERIC(5,2),
      rank_position INTEGER,
      total_competitors INTEGER,
      ranking_factors JSONB,
      raw_data JSONB,
      llm_analysis JSONB,
      status VARCHAR(50) DEFAULT 'pending',
      status_detail JSONB,
      error_message TEXT,
      gbp_location_id VARCHAR(255),
      gbp_account_id VARCHAR(255),
      gbp_location_name VARCHAR(255),
      batch_id VARCHAR(255),
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- 9. agent_results
    CREATE TABLE IF NOT EXISTS agent_results (
      id SERIAL PRIMARY KEY,
      google_account_id INTEGER,
      domain TEXT,
      agent_type VARCHAR(50),
      date_start DATE,
      date_end DATE,
      agent_input JSONB,
      agent_output JSONB,
      status VARCHAR(50) DEFAULT 'pending',
      error_message TEXT,
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- 10. tasks
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      google_account_id INTEGER,
      domain_name TEXT,
      title TEXT NOT NULL,
      description TEXT,
      category VARCHAR(50) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      is_approved BOOLEAN NOT NULL DEFAULT false,
      created_by_admin BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP WITHOUT TIME ZONE,
      due_date TIMESTAMP WITHOUT TIME ZONE,
      metadata JSONB,
      agent_type VARCHAR(50),
      CONSTRAINT tasks_category_check CHECK (category IN ('ALLORO', 'USER')),
      CONSTRAINT tasks_status_check CHECK (status IN ('complete', 'pending', 'in_progress', 'archived'))
    );

    -- 11. pms_jobs (never had google_account_id, only domain)
    CREATE TABLE IF NOT EXISTS pms_jobs (
      id SERIAL PRIMARY KEY,
      domain TEXT,
      time_elapsed INTEGER,
      status VARCHAR(50),
      response_log JSON,
      "timestamp" TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      is_approved BOOLEAN DEFAULT false,
      is_client_approved BOOLEAN DEFAULT false,
      automation_status_detail JSONB,
      raw_input_data JSONB
    );

    -- 12. notifications
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      google_account_id BIGINT,
      domain_name TEXT,
      title VARCHAR(255) NOT NULL,
      message TEXT,
      type VARCHAR(50) NOT NULL DEFAULT 'system',
      read BOOLEAN DEFAULT false,
      read_timestamp TIMESTAMP WITHOUT TIME ZONE,
      metadata JSONB,
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP TABLE IF EXISTS notifications;
    DROP TABLE IF EXISTS pms_jobs;
    DROP TABLE IF EXISTS tasks;
    DROP TABLE IF EXISTS agent_results;
    DROP TABLE IF EXISTS practice_rankings;
    DROP TABLE IF EXISTS google_data_store;
    DROP TABLE IF EXISTS google_accounts;
    DROP TABLE IF EXISTS invitations;
    DROP TABLE IF EXISTS organization_users;
    DROP TABLE IF EXISTS organizations;
    DROP TABLE IF EXISTS otp_codes;
    DROP TABLE IF EXISTS users;
    DROP SCHEMA IF EXISTS knowledgebase CASCADE;
    DROP SCHEMA IF EXISTS minds CASCADE;
    DROP SCHEMA IF EXISTS website_builder CASCADE;
  `);
}
