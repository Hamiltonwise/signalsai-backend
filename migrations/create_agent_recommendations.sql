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