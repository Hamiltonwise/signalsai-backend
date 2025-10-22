-- =====================================================================
-- Database Migration: Agent Processing Tables
-- Created: 2025-10-22
-- Purpose: Support multi-client agent processing system
-- =====================================================================

-- Table 1: google_data_store
-- Stores raw Google service data (GA4, GBP, GSC) per date range
CREATE TABLE IF NOT EXISTS google_data_store (
    id SERIAL PRIMARY KEY,
    google_account_id INT8 NOT NULL,
    domain VARCHAR(255) NOT NULL,
    date_start DATE NOT NULL,
    date_end DATE NOT NULL,
    run_type VARCHAR(50) NOT NULL, -- 'daily' or 'monthly'
    ga4_data JSONB,
    gbp_data JSONB,
    gsc_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for google_data_store
CREATE INDEX IF NOT EXISTS idx_google_data_store_account_domain 
    ON google_data_store(google_account_id, domain);
CREATE INDEX IF NOT EXISTS idx_google_data_store_dates 
    ON google_data_store(date_start, date_end);
CREATE INDEX IF NOT EXISTS idx_google_data_store_run_type 
    ON google_data_store(run_type);

-- Table 2: agent_results
-- Stores agent processing results and outputs
CREATE TABLE IF NOT EXISTS agent_results (
    id SERIAL PRIMARY KEY,
    google_account_id INT8 NOT NULL,
    domain VARCHAR(255) NOT NULL,
    agent_type VARCHAR(50) NOT NULL, -- 'proofline', 'summary', 'opportunity'
    date_start DATE NOT NULL,
    date_end DATE NOT NULL,
    agent_input JSONB, -- What was sent to the agent
    agent_output JSONB, -- What the agent returned
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'success', 'error', 'pending'
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for agent_results
CREATE INDEX IF NOT EXISTS idx_agent_results_account_domain 
    ON agent_results(google_account_id, domain);
CREATE INDEX IF NOT EXISTS idx_agent_results_type 
    ON agent_results(agent_type);
CREATE INDEX IF NOT EXISTS idx_agent_results_dates 
    ON agent_results(date_start, date_end);
CREATE INDEX IF NOT EXISTS idx_agent_results_status 
    ON agent_results(status);
CREATE INDEX IF NOT EXISTS idx_agent_results_created 
    ON agent_results(created_at DESC);

-- Comments for documentation
COMMENT ON TABLE google_data_store IS 'Stores raw Google service data (GA4, GBP, GSC) for agent processing';
COMMENT ON TABLE agent_results IS 'Stores agent processing results and outputs for all agent types';

COMMENT ON COLUMN google_data_store.run_type IS 'Type of run: daily or monthly';
COMMENT ON COLUMN agent_results.agent_type IS 'Agent type: proofline (daily), summary (monthly), opportunity (monthly)';
COMMENT ON COLUMN agent_results.status IS 'Processing status: success, error, or pending';