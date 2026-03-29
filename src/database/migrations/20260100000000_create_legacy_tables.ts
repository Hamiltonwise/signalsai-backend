import type { Knex } from "knex";

/**
 * Baseline migration: creates all legacy tables that existed before the Knex
 * migration system was adopted. Uses IF NOT EXISTS throughout so it is a
 * safe no-op on production databases where these tables already exist.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    -- Schema used by the website builder subsystem
    CREATE SCHEMA IF NOT EXISTS website_builder;

    -- 1. users
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      name VARCHAR(255),
      password_hash VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- 2. otp_codes
    CREATE TABLE IF NOT EXISTS otp_codes (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      code VARCHAR(255) NOT NULL,
      used BOOLEAN DEFAULT false,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- 3. organizations
    CREATE TABLE IF NOT EXISTS organizations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      domain VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- 4. organization_users (join table)
    CREATE TABLE IF NOT EXISTS organization_users (
      user_id INTEGER NOT NULL REFERENCES users(id),
      organization_id INTEGER NOT NULL REFERENCES organizations(id),
      role VARCHAR(255) DEFAULT 'admin',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, organization_id)
    );

    -- 5. invitations
    CREATE TABLE IF NOT EXISTS invitations (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      organization_id INTEGER NOT NULL REFERENCES organizations(id),
      role VARCHAR(255) NOT NULL,
      token VARCHAR(255) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS google_accounts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      google_user_id VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      refresh_token VARCHAR(255) NOT NULL,
      access_token VARCHAR(255),
      token_type VARCHAR(255),
      expiry_date TIMESTAMPTZ,
      scopes VARCHAR(255),
      domain_name VARCHAR(255),
      practice_name VARCHAR(255),
      phone VARCHAR(255),
      operational_jurisdiction VARCHAR(500),
      first_name VARCHAR(255),
      last_name VARCHAR(255),
      organization_id INTEGER REFERENCES organizations(id),
      onboarding_completed BOOLEAN DEFAULT false,
      google_property_ids JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- 6. practice_rankings
    CREATE TABLE IF NOT EXISTS practice_rankings (
      id SERIAL PRIMARY KEY,
      google_account_id INTEGER NOT NULL REFERENCES google_accounts(id),
      domain TEXT,
      specialty VARCHAR(255) NOT NULL,
      location VARCHAR(255) NOT NULL,
      gbp_account_id VARCHAR(255),
      gbp_location_id VARCHAR(255),
      gbp_location_name VARCHAR(255),
      batch_id VARCHAR(255),
      observed_at TIMESTAMPTZ,
      status VARCHAR(255) DEFAULT 'pending',
      status_detail JSONB,
      llm_analysis JSONB,
      ranking_factors JSONB,
      raw_data JSONB,
      rank_score NUMERIC,
      rank_position INTEGER,
      total_competitors INTEGER,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- 7. agent_results
    CREATE TABLE IF NOT EXISTS agent_results (
      id SERIAL PRIMARY KEY,
      google_account_id INTEGER NOT NULL REFERENCES google_accounts(id),
      domain TEXT,
      agent_type VARCHAR(255) NOT NULL,
      date_start VARCHAR(255),
      date_end VARCHAR(255),
      data JSONB,
      agent_input JSONB,
      agent_output JSONB,
      status VARCHAR(255) DEFAULT 'pending',
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- 8. tasks
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      google_account_id INTEGER NOT NULL REFERENCES google_accounts(id),
      domain_name TEXT,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      category VARCHAR(255) DEFAULT 'ALLORO',
      agent_type VARCHAR(255),
      status VARCHAR(255) DEFAULT 'pending',
      is_approved BOOLEAN DEFAULT false,
      created_by_admin BOOLEAN DEFAULT false,
      due_date TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- 9. pms_jobs
    CREATE TABLE IF NOT EXISTS pms_jobs (
      id SERIAL PRIMARY KEY,
      google_account_id INTEGER NOT NULL REFERENCES google_accounts(id),
      domain TEXT,
      status VARCHAR(255) NOT NULL,
      time_elapsed INTEGER,
      is_approved BOOLEAN DEFAULT false,
      is_client_approved BOOLEAN DEFAULT false,
      response_log JSONB,
      raw_input_data JSONB,
      automation_status_detail JSONB,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- 10. notifications
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      google_account_id INTEGER NOT NULL REFERENCES google_accounts(id),
      domain_name TEXT,
      title VARCHAR(255) NOT NULL,
      message TEXT,
      type VARCHAR(255) NOT NULL,
      priority VARCHAR(255),
      read BOOLEAN DEFAULT false,
      read_timestamp TIMESTAMPTZ,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
    DROP TABLE IF EXISTS google_accounts;
    DROP TABLE IF EXISTS invitations;
    DROP TABLE IF EXISTS organization_users;
    DROP TABLE IF EXISTS organizations;
    DROP TABLE IF EXISTS otp_codes;
    DROP TABLE IF EXISTS users;
    DROP SCHEMA IF EXISTS website_builder CASCADE;
  `);
}
