# Practice Ranking Agent - Implementation Plan

## Overview

This document outlines the complete implementation plan for the **Practice Ranking** feature in the admin dashboard. The feature will analyze client dental specialty practices against local competitors, produce a proprietary local ranking score, and generate a comprehensive JSON report.

---

## 1. Database Schema

### New Table: `practice_rankings`

```sql
-- ------------------------------------------------------------
-- Table: public.practice_rankings
-- Stores practice ranking analysis results
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "practice_rankings" (
  "id" SERIAL PRIMARY KEY,
  "google_account_id" bigint NOT NULL,
  "domain" character varying(255) NOT NULL,
  "specialty" character varying(100) NOT NULL, -- e.g., 'orthodontics', 'endodontics'
  "location" character varying(255), -- search location used
  "period" character varying(50) DEFAULT 'last_14d', -- analysis period
  "observed_at" timestamp without time zone NOT NULL,

  -- Ranking Score Components
  "rank_score" numeric(5,2), -- Final proprietary score (0-100)
  "rank_position" integer, -- Position among competitors
  "total_competitors" integer, -- Total competitors analyzed

  -- Score Factors (8 weighted factors)
  "factor_category_match" numeric(5,2), -- Primary Category Match (25%)
  "factor_review_count" numeric(5,2), -- Total Review Count (20%)
  "factor_star_rating" numeric(5,2), -- Overall Star Rating (15%)
  "factor_keyword_name" numeric(5,2), -- Keyword in Business Name (10%)
  "factor_review_velocity" numeric(5,2), -- Review Velocity/Recency (10%)
  "factor_nap_consistency" numeric(5,2), -- NAP Consistency (8%)
  "factor_gbp_activity" numeric(5,2), -- GBP Profile Activity (7%)
  "factor_sentiment" numeric(5,2), -- Review Sentiment (5%)

  -- Raw Data Storage (JSONB for flexibility)
  "client_data" jsonb, -- GSC + GBP authenticated data
  "competitor_data" jsonb, -- Apify scraped competitor data
  "website_audit" jsonb, -- Core Web Vitals, schema analysis
  "top_queries" jsonb, -- GSC top queries data
  "page_mapping" jsonb, -- Website audit page mapping

  -- LLM Analysis
  "gaps" jsonb, -- LLM-generated gap analysis
  "drivers" jsonb, -- LLM-generated ranking drivers
  "render_text" text, -- LLM-generated summary
  "verdict" character varying(255),
  "confidence" numeric(3,2),
  "citations" jsonb DEFAULT '[]'::jsonb,

  -- Metadata
  "status" character varying(50) DEFAULT 'pending', -- pending, processing, completed, failed
  "error_message" text,
  "processing_time_ms" integer,
  "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,

  -- Foreign Key
  CONSTRAINT "practice_rankings_google_account_id_fkey"
    FOREIGN KEY ("google_account_id") REFERENCES "google_accounts" ("id") ON DELETE CASCADE
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS "idx_practice_rankings_google_account" ON "practice_rankings" ("google_account_id");
CREATE INDEX IF NOT EXISTS "idx_practice_rankings_domain" ON "practice_rankings" ("domain");
CREATE INDEX IF NOT EXISTS "idx_practice_rankings_specialty" ON "practice_rankings" ("specialty");
CREATE INDEX IF NOT EXISTS "idx_practice_rankings_created_at" ON "practice_rankings" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_practice_rankings_status" ON "practice_rankings" ("status");
```

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Admin Dashboard (Frontend)                   │
│                  /admin/practice-ranking                        │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Backend API Endpoints                         │
│              /api/admin/practice-ranking/*                       │
├─────────────────────────────────────────────────────────────────┤
│  POST /trigger      - Start new analysis                        │
│  GET  /status/:id   - Check analysis status                     │
│  GET  /results/:id  - Get full results                          │
│  GET  /list         - List all analyses for an account          │
│  GET  /accounts     - List onboarded accounts for dropdown      │
└─────────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  GBP API         │ │  GSC API         │ │  Apify API       │
│  (OAuth Token)   │ │  (OAuth Token)   │ │  (API Key)       │
│                  │ │                  │ │                  │
│  - Views/Clicks  │ │  - Top Queries   │ │  - Competitor    │
│  - Reviews       │ │  - Impressions   │ │    Discovery     │
│  - Profile Data  │ │  - CTR           │ │  - Deep Scrape   │
│                  │ │  - Position      │ │  - Website Audit │
└──────────────────┘ └──────────────────┘ └──────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Ranking Algorithm                             │
│                   (8 Weighted Factors)                          │
├─────────────────────────────────────────────────────────────────┤
│  1. Primary Category Match (25%)                                │
│  2. Total Review Count (20%)                                    │
│  3. Overall Star Rating (15%)                                   │
│  4. Keyword in Business Name (10%)                              │
│  5. Review Velocity/Recency (10%)                               │
│  6. NAP Consistency (8%)                                        │
│  7. GBP Profile Activity (7%)                                   │
│  8. Review Sentiment (5%)                                       │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      LLM Analysis                                │
│              (Claude/GPT for gap analysis)                       │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Database Storage                               │
│              practice_rankings table                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. File Changes Required

### Backend Files

| File                               | Action     | Description                        |
| ---------------------------------- | ---------- | ---------------------------------- |
| `src/routes/practiceRanking.ts`    | **CREATE** | Main route file with all endpoints |
| `src/services/apifyService.ts`     | **CREATE** | Apify API integration service      |
| `src/services/rankingAlgorithm.ts` | **CREATE** | Proprietary ranking calculation    |
| `src/index.ts`                     | **MODIFY** | Register new route                 |

### Frontend Files

| File                                                 | Action     | Description          |
| ---------------------------------------------------- | ---------- | -------------------- |
| `../signalsai/src/pages/admin/PracticeRanking.tsx`   | **CREATE** | Main page component  |
| `../signalsai/src/pages/Admin.tsx`                   | **MODIFY** | Add route            |
| `../signalsai/src/components/Admin/AdminSidebar.tsx` | **MODIFY** | Add nav item         |
| `../signalsai/src/api/practiceRanking.ts`            | **CREATE** | API client functions |

---

## 4. Backend Implementation Details

### 4.1 Route Structure (`src/routes/practiceRanking.ts`)

```typescript
// Endpoints:
// POST   /api/admin/practice-ranking/trigger
// GET    /api/admin/practice-ranking/status/:id
// GET    /api/admin/practice-ranking/results/:id
// GET    /api/admin/practice-ranking/list
// GET    /api/admin/practice-ranking/accounts
```

### 4.2 Data Flow (12 Steps from Implementation Plan)

1. **Input/Auth**: Collect input (Specialty, Location) and retrieve client credentials from `google_accounts`
2. **Competitor Discovery**: Call Apify Maps Scraper to identify ~100 competitor Place IDs
3. **Client Data Fetch**: Concurrently call GBP API and GSC API using stored OAuth tokens
4. **Competitor Deep Scrape**: Call Apify Maps Scraper for detailed competitor data
5. **Website Audit**: Call Apify SEO Actor on client's domain for Core Web Vitals
6. **Competitor Proxy Fetch**: (Optional) Call third-party SEO API for competitor rankings
7. **Data Standardization**: Map all data streams to unified JSON schema
8. **Score Calculation**: Execute 8-factor weighted formula
9. **Storage**: Save all data to `practice_rankings` table
10. **LLM Input Compilation**: Compile master JSON for LLM
11. **LLM Analysis**: Generate gaps, drivers, render_text
12. **Final Output**: Return validated JSON response

### 4.3 Apify Integration

Using `axios` to call Apify API:

```typescript
// Google Maps Scraper Actor
const APIFY_MAPS_ACTOR = "compass/crawler-google-places";

// Website Audit Actor (Lighthouse)
const APIFY_LIGHTHOUSE_ACTOR = "matin/lighthouse";

// API Base URL
const APIFY_API_BASE = "https://api.apify.com/v2";
```

### 4.4 Environment Variables Required

```env
# Apify Configuration
APIFY_API_TOKEN=your_apify_token

# Optional: Third-party SEO API
SEMRUSH_API_KEY=your_semrush_key (optional)
```

---

## 5. Frontend Implementation Details

### 5.1 Page Layout

The Practice Ranking page will include:

1. **Account Selector**: Dropdown to select which client to analyze
2. **Configuration Form**:
   - Specialty selection (Orthodontics, Endodontics, etc.)
   - Location input (city, state or coordinates)
   - Analysis period selection
3. **Trigger Button**: Start analysis
4. **Results Display**:
   - Overall rank score with visual gauge
   - Factor breakdown chart
   - Competitor comparison table
   - Gap analysis cards
   - Recommendations list
5. **History Table**: Previous analyses for the selected account

### 5.2 Navigation Item

Add to `AdminSidebar.tsx`:

- Key: `practice-ranking`
- Label: `Practice Ranking`
- Icon: `Trophy` or `Target` from lucide-react

---

## 6. API Response Schema

Final response matches the schema from the implementation guide:

```json
{
  "practice_id": "string",
  "specialty": "orthodontics",
  "observed_at": "2025-10-24T00:00:00Z",
  "period": "last_14d",
  "snapshot": {
    "organic_avg_position": 4.2,
    "map_pack_presence_rate": 0.65,
    "impressions": 12500,
    "clicks": 890,
    "ctr": 0.071,
    "volatility_index": 0.15
  },
  "top_queries": [...],
  "page_mapping": [...],
  "gaps": [...],
  "drivers": [...],
  "render_text": "string",
  "links": [{"label": "GSC query report", "url": "string"}],
  "verdict": "string",
  "confidence": 0.85,
  "citations": ["string"],
  "freshness": "string",
  "lineage": "string"
}
```

---

## 7. Implementation Order

1. **Phase 1: Database & Backend Foundation**

   - Create `practice_rankings` table (SQL provided above)
   - Create `src/routes/practiceRanking.ts` with basic CRUD
   - Create `src/services/apifyService.ts`
   - Register route in `src/index.ts`

2. **Phase 2: Data Collection**

   - Implement Apify competitor discovery
   - Integrate GSC/GBP data fetching using existing helpers
   - Implement website audit integration

3. **Phase 3: Ranking Algorithm**

   - Create `src/services/rankingAlgorithm.ts`
   - Implement 8-factor scoring system
   - Add score normalization

4. **Phase 4: LLM Analysis**

   - Integrate with existing Anthropic SDK
   - Create prompts for gap analysis
   - Generate render_text summaries

5. **Phase 5: Frontend**
   - Create `PracticeRanking.tsx` page
   - Add navigation item
   - Implement results visualization

---

## 8. Questions for User

Before proceeding to implementation:

1. **Apify API Token**: Do you have an Apify account and API token ready?
2. **Competitor Count**: Should we analyze all ~100 competitors or limit to top 20-30?
3. **LLM Model**: Use existing Anthropic SDK or add OpenAI?
4. **Real-time vs Batch**: Should analysis run synchronously or as a background job?
5. **Caching**: How long should competitor data be cached before re-scraping?

---

## 9. Estimated Effort

| Component         | Estimated Time |
| ----------------- | -------------- |
| Database Table    | 10 minutes     |
| Backend Routes    | 2-3 hours      |
| Apify Integration | 1-2 hours      |
| Ranking Algorithm | 1-2 hours      |
| LLM Integration   | 1 hour         |
| Frontend Page     | 2-3 hours      |
| Testing & Debug   | 1-2 hours      |
| **Total**         | **8-13 hours** |

---

## Next Steps

Once you approve this plan:

1. Run the SQL query to create the `practice_rankings` table
2. Add `APIFY_API_TOKEN` to your `.env` file
3. Switch to Code mode to begin implementation
