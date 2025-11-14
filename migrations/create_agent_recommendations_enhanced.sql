-- Create agent_recommendations table for AI Data Insights Dashboard
-- Stores individual recommendations from Guardian and Governance Sentinel agents
-- for admin oversight and tracking

CREATE TABLE agent_recommendations (
    id SERIAL PRIMARY KEY,
    
    -- Relationship to guardian/governance run
    agent_result_id INTEGER,
    source_agent_type VARCHAR(50),        -- 'guardian' or 'governance_sentinel'
    agent_under_test VARCHAR(50),         -- 'proofline', 'opportunity', 'summary', 'cro_optimizer'
    
    -- Core fields (always shown)
    title VARCHAR(500) NOT NULL,
    explanation TEXT,
    
    -- Metadata (shown in expanded view)
    type VARCHAR(50),                      -- 'USER', 'ALLORO'
    urgency VARCHAR(50),                   -- 'Immediate', 'Next Visit'
    category VARCHAR(100),                 -- 'Operational', 'Experience'
    severity INTEGER DEFAULT 1,            -- 1-2
    
    -- Agent verdict info
    verdict VARCHAR(50),                   -- 'PASS', 'PENDING_VERIFICATION', 'FAIL'
    confidence DECIMAL(3,2),               -- 0.60-0.90
    
    -- Action details
    suggested_action TEXT,                 -- Step-by-step fix instructions
    rule_reference TEXT,                   -- Which governance rule was triggered
    evidence_links JSONB DEFAULT '[]',     -- Array of {url, label}
    escalation_required BOOLEAN DEFAULT FALSE,
    
    -- Status tracking
    status VARCHAR(50) DEFAULT 'PENDING',  -- 'PENDING' or 'COMPLETED'
    
    -- Timestamps
    observed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_agent_recommendations_result_id ON agent_recommendations(agent_result_id);
CREATE INDEX idx_agent_recommendations_under_test ON agent_recommendations(agent_under_test);
CREATE INDEX idx_agent_recommendations_source ON agent_recommendations(source_agent_type);
CREATE INDEX idx_agent_recommendations_status ON agent_recommendations(status);
CREATE INDEX idx_agent_recommendations_observed ON agent_recommendations(observed_at DESC);
CREATE INDEX idx_agent_recommendations_created ON agent_recommendations(created_at DESC);

-- Add comments for documentation
COMMENT ON TABLE agent_recommendations IS 'Stores individual recommendations from Guardian and Governance Sentinel agents for admin oversight';
COMMENT ON COLUMN agent_recommendations.agent_result_id IS 'References the parent guardian or governance_sentinel result in agent_results table';
COMMENT ON COLUMN agent_recommendations.agent_under_test IS 'The agent being analyzed (proofline, opportunity, summary, cro_optimizer)';
COMMENT ON COLUMN agent_recommendations.status IS 'PENDING or COMPLETED - tracks whether admin has addressed the recommendation';