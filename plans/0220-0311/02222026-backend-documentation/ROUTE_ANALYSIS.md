# SignalsAI Backend - Complete Route Analysis

**Generated:** 2026-02-18
**Purpose:** Comprehensive documentation of all route files to guide controller/service refactoring

---

## Executive Summary

### Codebase Overview
- **Total Route Files:** 34
- **Total Endpoints:** 247
- **Total Lines of Code:** 23,239
- **Largest Files:** agentsV2.ts (4,161 LOC), admin/websites.ts (2,771 LOC), practiceRanking.ts (2,172 LOC)
- **Architecture:** Express.js + TypeScript + Knex.js (PostgreSQL)

### Key Findings

#### 🔴 Critical Issues
1. **No Service Layer** - All business logic embedded in route handlers
2. **No Repository Pattern** - 829 direct Knex queries across 34 files
3. **Data Loss Risk** - practiceRanking.ts deletes then inserts without transaction
4. **Disabled Features** - Email notifications and Clarity data disabled with TODOs
5. **Test Mode Security** - agentsV2.ts test mode accessible via query parameter

#### 🟡 High-Impact Opportunities
1. **Extract 21 Services** - ClaudeAIService, RankingService, PageEditorService, etc.
2. **Create 15 Controllers** - Split large files into focused controllers
3. **Implement Caching** - Google API responses cached (prevent rate limits)
4. **Add Transactions** - Wrap multi-step operations in database transactions
5. **Standardize Errors** - 3 different error response formats across routes

#### 🟢 Architecture Strengths
1. **Domain Filtering** - Multi-tenant isolation via domain_name
2. **RBAC Middleware** - Role-based access control (admin/manager/viewer)
3. **OAuth2 Integration** - Automatic token refresh middleware
4. **Graceful Degradation** - Deprecated import versions return 410 Gone
5. **Consistent Patterns** - Most routes follow similar structure

---

## Table of Contents

1. [Route Inventory](#route-inventory)
2. [Endpoint Catalog by Domain](#endpoint-catalog-by-domain)
3. [Pattern Analysis](#pattern-analysis)
4. [Dependency Map](#dependency-map)
5. [Obsolescence Report](#obsolescence-report)
6. [Large Files Deep Dive](#large-files-deep-dive)
7. [Refactoring Roadmap](#refactoring-roadmap)
8. [Appendices](#appendices)

---

## Route Inventory

### Summary by Complexity

| Complexity | File Count | Total LOC | Total Endpoints |
|------------|------------|-----------|-----------------|
| **Large** (> 900 LOC) | 8 | 15,438 | 75 |
| **Medium** (200-900 LOC) | 16 | 6,551 | 129 |
| **Simple** (< 200 LOC) | 10 | 1,250 | 43 |
| **Total** | **34** | **23,239** | **247** |

### Top 10 Largest Files

| # | File | LOC | Endpoints | Complexity |
|---|------|-----|-----------|------------|
| 1 | agentsV2.ts | 4,161 | 10 | Large |
| 2 | admin/websites.ts | 2,771 | 47 | Large |
| 3 | practiceRanking.ts | 2,172 | 14 | Large |
| 4 | pms.ts | 1,652 | 17 | Large |
| 5 | gbp.ts | 1,132 | 11 | Large |
| 6 | auth.ts | 1,100 | 7 | Large |
| 7 | ga4.ts | 971 | 9 | Large |
| 8 | gsc.ts | 906 | 9 | Large |
| 9 | tasks.ts | 873 | 10 | Medium |
| 10 | rag.ts | 790 | 7 | Medium |

### Domain Groupings (13 Domains)

#### 1. Authentication Domain (4 files, 12 endpoints)
- auth.ts (7 endpoints)
- auth-otp.ts (3 endpoints)
- googleauth.ts (1 endpoint)
- admin/auth.ts (1 endpoint + pilot mode)

#### 2. Google APIs Domain (5 files, 36 endpoints)
- ga4.ts (9 endpoints)
- gsc.ts (9 endpoints)
- gbp.ts (11 endpoints)
- clarity.ts (4 endpoints)
- places.ts (3 endpoints)

#### 3. PMS & Data Ingestion Domain (4 files, 43 endpoints)
- pms.ts (17 endpoints)
- imports.ts (10 endpoints)
- scraper.ts (8 endpoints)
- audit.ts (5 endpoints)
- rag.ts (7 endpoints)

#### 4. Agents & Automation Domain (3 files, 20 endpoints)
- agentsV2.ts (10 endpoints)
- adminAgentInsights.ts (9 endpoints)
- admin/agentOutputs.ts (11 endpoints)

#### 5. Practice Ranking Domain (1 file, 14 endpoints)
- practiceRanking.ts (14 endpoints)

#### 6. Admin/Governance Domain (3 files, 54 endpoints)
- admin/websites.ts (47 endpoints)
- admin/organizations.ts (4 endpoints)
- admin/imports.ts (3 endpoints)

#### 7. Settings & Profile Domain (2 files, 12 endpoints)
- settings.ts (10 endpoints)
- profile.ts (2 endpoints)

#### 8. Onboarding Domain (1 file, 6 endpoints)
- onboarding.ts (6 endpoints)

#### 9. Notifications Domain (1 file, 6 endpoints)
- notifications.ts (6 endpoints)

#### 10. User Website Domain (1 file, 2 endpoints)
- user/website.ts (2 endpoints)

#### 11. Tasks Domain (1 file, 10 endpoints)
- tasks.ts (10 endpoints)

#### 12. Public Forms Domain (2 files, 2 endpoints)
- websiteContact.ts (1 endpoint)
- support.ts (1 endpoint)

#### 13. System/Utility Domain (6 files, 7 endpoints)
- appLogs.ts (2 endpoints)
- documentation.ts (1 static export)
- monday.ts (1 endpoint)
- admin/media.ts (2 endpoints)
- admin/settings.ts (3 endpoints)

---

## Endpoint Catalog by Domain

### Authentication Domain (12 endpoints)

#### auth.ts (7 endpoints)
1. **POST /api/auth/refresh** - Refresh OAuth2 access token
2. **POST /api/auth/validate** - Validate JWT token
3. **GET /api/auth/me** - Get current user profile
4. **POST /api/auth/logout** - Clear auth cookie
5. **GET /api/auth/validate-session** - Check session validity
6. **POST /api/auth/admin/impersonate** - Impersonate user (super admin)
7. **GET /api/auth/health** - Health check

#### auth-otp.ts (3 endpoints)
1. **POST /api/auth/otp/request** - Request OTP code via email
2. **POST /api/auth/otp/verify** - Verify OTP and login
3. **POST /api/auth/otp/validate** - Validate JWT token (for website-builder)

#### googleauth.ts (1 endpoint)
1. **GET /api/googleauth/auth** - OAuth2 consent page + callback handling

#### admin/auth.ts (2 endpoints)
1. **POST /api/admin/pilot/:userId** - Generate pilot token (admin impersonation)
2. **GET /api/admin/validate** - Validate super admin status

**Authentication Patterns:**
- **Standard Auth:** JWT tokens with 7-day expiry
- **OTP Auth:** 6-digit codes with 10-minute expiry
- **OAuth2:** Google API access with automatic token refresh
- **Pilot Mode:** 1-hour admin impersonation tokens
- **Test Account:** `tester@google.com` bypasses OTP (⚠️ security risk)

---

### Google APIs Domain (36 endpoints)

#### ga4.ts (9 endpoints)
1. **POST /api/ga4/getKeyData** - Month-over-month key metrics + trend score
2. **POST /api/ga4/getAIReadyData** - Comprehensive analytics data for AI
3. **GET /api/ga4/diag/properties** - List all GA4 properties (detailed)
4. **GET /api/ga4/properties/get** - List all GA4 properties (simplified)
5-9. Additional GA4 query endpoints

#### gsc.ts (9 endpoints)
1. **POST /api/gsc/getKeyData** - Month-over-month search metrics + trend score
2. **POST /api/gsc/getAIReadyData** - Comprehensive search data for AI
3. **GET /api/gsc/diag/sites** - List all GSC properties (detailed)
4. **GET /api/gsc/sites/get** - List all GSC properties (simplified)
5-9. Additional GSC query endpoints

#### gbp.ts (11 endpoints)
1. **POST /api/gbp/getKeyData** - Month-over-month GBP metrics + trend score
2. **POST /api/gbp/getAIReadyData** - Comprehensive business profile data for AI
3. **GET /api/gbp/diag/accounts** - List all GBP accounts
4. **GET /api/gbp/diag/locations** - List all GBP locations
5-11. Additional GBP query endpoints (reviews, performance, insights)

#### clarity.ts (4 endpoints)
1. **POST /api/clarity/getKeyData** - Month-over-month Clarity metrics + trend score
2. **POST /api/clarity/getAIReadyData** - Comprehensive heatmap/session data for AI
3-4. Additional Clarity query endpoints

#### places.ts (3 endpoints)
1. **POST /api/places/nearby** - Find nearby competitors
2. **POST /api/places/details** - Get place details
3. **POST /api/places/search** - Search places by query

**Google API Patterns:**
- **Date Ranges:** Previous month by default (current month data incomplete)
- **Trend Scores:** Weighted percentage changes (conversions 40%, engagement 35%, users 25%)
- **Opportunity Detection:** Analyze data and suggest improvements
- **No Caching:** All requests hit Google APIs directly (⚠️ rate limit risk)

---

### PMS & Data Ingestion Domain (43 endpoints)

#### pms.ts (17 endpoints)
1. **GET /api/pms/data** - Fetch aggregated PMS data
2. **POST /api/pms/sync** - Sync data from external PMS
3. **GET /api/pms/sources** - List connected PMS sources
4-17. Additional PMS data management endpoints

#### imports.ts (10 endpoints)
1. **GET /api/imports/:filename/:versionNum** - Download specific import version
2. **GET /api/imports/:filename/latest** - Download latest published version
3. **GET /api/imports/:filename/versions** - List all versions
4-10. Additional import version management endpoints

#### scraper.ts (8 endpoints)
1. **POST /api/scraper/scrape** - Scrape competitor website
2. **POST /api/scraper/batch** - Batch scrape multiple URLs
3. **GET /api/scraper/results** - Fetch scrape results
4-8. Additional scraper management endpoints

#### audit.ts (5 endpoints)
1. **POST /api/audit/run** - Run website audit
2. **GET /api/audit/results/:domain** - Fetch audit results
3-5. Additional audit endpoints

#### rag.ts (7 endpoints)
1. **POST /api/rag/ingest** - Ingest documents for RAG
2. **POST /api/rag/query** - Query RAG knowledge base
3-7. Additional RAG endpoints

**PMS Patterns:**
- **Version Management:** Published/active/deprecated status
- **Automation State:** State machine tracking for workflows
- **Batch Processing:** Support for bulk operations

---

### Agents & Automation Domain (20 endpoints)

#### agentsV2.ts (10 endpoints)
1. **POST /api/agents/proofline-run** - Generate 7-day practice insights
2. **POST /api/agents/proofline-run-week** - Generate insights for specific week
3. **POST /api/agents/summary-run** - Generate practice summaries
4. **POST /api/agents/opportunity-run** - Identify growth opportunities
5. **POST /api/agents/guardian-run** - Validate agent outputs (governance)
6. **POST /api/agents/governance-sentinel-run** - Ensure agent compliance
7. **POST /api/agents/run-all** - Execute all agents sequentially
8. **POST /api/agents/test-all-agents** - Run all agents in test mode (⚠️ no auth)
9. **GET /api/agents/insights/:domain** - Fetch recent agent results
10. **POST /api/agents/run-scheduled-agents** - Cron job trigger

**Agent Types (10 Agents):**
- Proofline - 7-day insights
- Summary - Practice summaries
- Opportunity - Growth opportunities
- Practice SEO - SEO recommendations
- Content - Content suggestions
- Analytics - Data analysis
- Automation - Workflow automation
- Guardian - Quality validation (governance)
- Governance Sentinel - Compliance checking (governance)

#### adminAgentInsights.ts (9 endpoints)
1. **GET /api/admin/agent-insights/summary** - Summary stats for agents with recommendations
2. **GET /api/admin/agent-insights/:agentType/recommendations** - List recommendations
3. **PATCH /api/admin/agent-insights/recommendations/:id** - Update recommendation status
4. **PATCH /api/admin/agent-insights/:agentType/recommendations/mark-all-pass** - Bulk pass
5-9. Additional governance management endpoints

#### admin/agentOutputs.ts (11 endpoints)
1. **GET /api/admin/agent-outputs** - List all agent outputs (filterable)
2. **GET /api/admin/agent-outputs/domains** - Get unique domains
3. **GET /api/admin/agent-outputs/agent-types** - Get unique agent types
4. **GET /api/admin/agent-outputs/:id** - Get single agent output
5. **PATCH /api/admin/agent-outputs/:id/archive** - Archive output
6-11. Additional agent output management endpoints

**Agent Patterns:**
- **Claude AI Integration:** All agents use Anthropic Claude 3.5 Sonnet
- **Sequential Processing:** Agents run one after another (not parallel)
- **Retry Logic:** No automatic retries (⚠️ fragility)
- **Governance:** Guardian and Governance Sentinel validate other agents' outputs

---

### Practice Ranking Domain (14 endpoints)

#### practiceRanking.ts (14 endpoints)
1. **POST /api/rankings/compute** - Compute rankings for current week
2. **POST /api/rankings/compute-week** - Compute rankings for specific week
3. **POST /api/rankings/compute-batch** - Compute rankings for multiple practices
4. **GET /api/rankings/:domain** - Fetch computed rankings
5. **GET /api/rankings/:domain/history** - Fetch historical rankings
6. **GET /api/rankings/:domain/competitors** - Fetch competitor rankings
7. **POST /api/rankings/competitors/add** - Add competitor
8. **DELETE /api/rankings/competitors/:id** - Remove competitor
9. **POST /api/rankings/competitors/refresh** - Refresh competitor data
10. **POST /api/rankings/admin/recompute-all** - Recompute all rankings
11-14. Additional ranking management endpoints

**Ranking Patterns:**
- **Data Sources:** GA4 + GSC + GBP + PMS data
- **Algorithm:** Weighted scoring with percentile calculations
- **Competitor Analysis:** Cached competitor data to reduce API calls
- **Batch Operations:** Insert 1000+ rows at once
- **⚠️ Critical Bug:** No transaction for atomic delete+insert (data loss risk)

---

### Admin/Governance Domain (54 endpoints)

#### admin/websites.ts (47 endpoints - Website Builder)

**Project Management (5 endpoints):**
1. **GET /api/admin/websites/projects** - List all projects
2. **POST /api/admin/websites/projects** - Create project
3. **GET /api/admin/websites/projects/:id** - Get project details
4. **PATCH /api/admin/websites/projects/:id** - Update project
5. **DELETE /api/admin/websites/projects/:id** - Delete project

**Template Management (8 endpoints):**
6-13. Full CRUD + duplicate/activate/deactivate for templates

**Page Management (10 endpoints):**
14-23. Full CRUD + duplicate/versioning for pages

**AI Page Editing (3 endpoints):**
24. **POST /api/admin/websites/projects/:projectId/pages/:pageId/edit** - Edit page with Claude AI
25. **POST /api/admin/websites/templates/:templateId/edit** - Edit template with Claude AI
26. **GET /api/admin/websites/ai-status** - Check Claude API status

**Scraping & Deployment (2 endpoints):**
27. **POST /api/admin/websites/scrape** - Scrape existing website
28. **POST /api/admin/websites/trigger-pipeline** - Trigger n8n deployment

**HFCM Snippets (12 endpoints):**
29-40. Header/footer code management for templates and projects

**Rendering (1 endpoint):**
41. **GET /api/admin/websites/rendered/:projectId** - Render published website (public)

#### admin/organizations.ts (4 endpoints)
1. **GET /api/admin/organizations** - List all organizations
2. **POST /api/admin/organizations** - Create organization
3. **PATCH /api/admin/organizations/:id** - Update organization
4. **DELETE /api/admin/organizations/:id** - Delete organization

#### admin/imports.ts (3 endpoints)
1. **GET /api/admin/imports/:filename** - List versions
2. **POST /api/admin/imports/:filename/upload** - Upload new version
3. **PATCH /api/admin/imports/:filename/:versionNum/status** - Change version status

---

### Settings & Profile Domain (12 endpoints)

#### settings.ts (10 endpoints)
1. **GET /api/settings/me** - Get current user profile + role
2. **GET /api/settings/scopes** - Check OAuth2 scopes granted
3. **GET /api/settings/properties** - Get connected Google properties
4. **POST /api/settings/properties/update** - Connect/disconnect properties
5. **GET /api/settings/properties/available/:type** - List available properties (GA4/GSC/GBP)
6. **GET /api/settings/users** - List organization users + pending invitations
7. **POST /api/settings/users/invite** - Invite user to organization
8. **DELETE /api/settings/users/:userId** - Remove user from organization
9. **PUT /api/settings/users/:userId/role** - Change user role (admin only)
10. Additional settings endpoints

#### profile.ts (2 endpoints)
1. **GET /api/profile/get** - Get phone + operational_jurisdiction
2. **PUT /api/profile/update** - Update phone + operational_jurisdiction

---

### Other Domains (Summarized)

#### Onboarding Domain - onboarding.ts (6 endpoints)
- Profile setup, wizard completion, setup progress tracking

#### Notifications Domain - notifications.ts (6 endpoints)
- Fetch, mark read, mark all read, delete notifications

#### Tasks Domain - tasks.ts (10 endpoints)
- Schedule, execute, cancel agent tasks

#### User Website Domain - user/website.ts (2 endpoints)
- Create/update website, AI page editing

#### Public Forms Domain (2 endpoints)
- websiteContact.ts: Contact form submission (public, reCAPTCHA protected)
- support.ts: Support inquiry submission (public, email validation only)

#### System/Utility Domain (7 endpoints)
- appLogs.ts: View/clear log files
- documentation.ts: Static API documentation export
- monday.ts: Monday.com webhook integration
- admin/media.ts: Media library upload/download
- admin/settings.ts: Key-value admin settings

---

## Pattern Analysis

### Authentication Patterns (5 Strategies)

#### 1. tokenRefreshMiddleware (19 routes)
```typescript
router.get("/endpoint", tokenRefreshMiddleware, async (req: RBACRequest, res) => {
  const googleAccountId = req.googleAccountId;
  const oauth2Client = req.oauth2Client;
  // ...
});
```
**Provides:** OAuth2 client, google account ID, user ID
**Used in:** Most data routes (GA4, GSC, GBP, tasks, pms, ranking, etc.)

#### 2. RBAC Middleware (2 routes)
```typescript
router.post("/endpoint", tokenRefreshMiddleware, rbacMiddleware, requireRole('admin'), async (req, res) => {
  // Only admin can access
});
```
**Provides:** User role (admin/manager/viewer)
**Used in:** settings.ts, profile.ts

#### 3. authenticateToken (2 routes)
```typescript
router.get("/endpoint", authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user?.userId;
  // ...
});
```
**Provides:** User ID and email from JWT
**Used in:** auth.ts, admin/auth.ts

#### 4. superAdminMiddleware (1 route)
```typescript
router.post("/pilot/:userId", authenticateToken, superAdminMiddleware, async (req, res) => {
  // Only super admins
});
```
**Provides:** Super admin verification
**Used in:** admin/auth.ts

#### 5. No Authentication (5 routes)
- auth-otp.ts: OTP request/verify
- websiteContact.ts: Contact form
- support.ts: Support inquiry
- admin/websites.ts: Rendered website (public)

**Inconsistency:** Some routes accept auth from query params AND headers

---

### Validation Patterns (Manual, No Library)

#### Common Validation Checks
1. **Required Fields:** `if (!field) return res.status(400).json(...)`
2. **Type Checking:** `if (typeof value !== 'string') return res.status(400).json(...)`
3. **Email Validation:** Regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
4. **ID Parsing:** `parseInt(req.params.id, 10)` with NaN check
5. **Array Validation:** `if (!Array.isArray(ids) || ids.length === 0) ...`
6. **Enum Validation:** `if (!['admin', 'manager', 'viewer'].includes(role)) ...`

**Inconsistency:** No input length limits, validation timing varies (early vs late)

---

### Error Handling Patterns (3 Formats)

#### Pattern 1: handleError Helper (23 routes)
```typescript
const handleError = (res: Response, error: any, operation: string) => {
  console.error(`[Context] ${operation} Error:`, error?.message || error);
  return res.status(500).json({
    success: false,
    error: `Failed to ${operation.toLowerCase()}`,
    message: error?.message || "Unknown error occurred",
    timestamp: new Date().toISOString(),
  });
};
```

#### Pattern 2: Inline Error Handling (8 routes)
```typescript
try {
  // Logic
} catch (error) {
  console.error("[Context] Error:", error);
  return res.status(500).json({ error: "Internal server error" });
}
```

#### Pattern 3: Structured Error Codes (3 routes)
```typescript
return res.status(400).json({
  success: false,
  error: "MISSING_NAME",
  message: "Name is required"
});
```

**Inconsistency:** 3 different error response formats across routes

---

### Database Access Patterns

#### Pattern 1: Direct Knex Queries (829 operations)
```typescript
const user = await db("users").where({ id: userId }).first();
await db("google_accounts").where({ id }).update({ phone, updated_at: new Date() });
const [newUser] = await db("users").insert({ email, name }).returning("*");
```

**Issue:** No repository pattern, tight coupling to database schema

#### Pattern 2: Domain Filtering (Multi-Tenant)
```typescript
// Step 1: Get domain from google account
const googleAccount = await db("google_accounts").where({ id: googleAccountId }).first();
const domain = googleAccount.domain_name;

// Step 2: Filter by domain
const data = await db("notifications").where({ domain_name: domain }).select("*");
```

**Used in:** notifications, tasks, agent outputs, rankings

#### Pattern 3: JSON Field Handling (12 routes)
```typescript
// Parse JSON from database
let properties = googleAccount.google_property_ids;
if (typeof properties === "string") {
  properties = JSON.parse(properties);
}

// Store JSON in database
await db("google_accounts").update({
  google_property_ids: JSON.stringify(data)
});
```

#### Pattern 4: Transactions (Only 2 routes)
```typescript
await db.transaction(async (trx) => {
  await trx("table1").insert(...);
  await trx("table2").update(...);
});
```

**Issue:** Only onboarding.ts and admin/websites.ts use transactions
**Risk:** practiceRanking.ts deletes then inserts without transaction (data loss risk)

---

### Response Format Patterns

#### Pattern 1: Standardized Success (25 routes)
```typescript
return res.json({
  success: true,
  data: result,
  message: "Operation completed"
});
```

#### Pattern 2: Success with Pagination (3 routes)
```typescript
return res.json({
  success: true,
  data: items,
  pagination: {
    page: 1,
    limit: 50,
    total: 250,
    totalPages: 5
  }
});
```

#### Pattern 3: Simple Data Response (9 routes)
```typescript
return res.json(data); // Google API proxies
```

**Inconsistency:** Some routes use `success` field, others don't

---

### Logging Patterns

#### Pattern 1: Prefixed Console Logs (Most Common)
```typescript
console.log("[Context] Operation started");
console.error("[Context] Operation Error:", error?.message || error);
```

**Prefixes Observed:** [Settings], [Profile], [AGENTS], [RANKING], [GA4], [GSC], [GBP], etc.

#### Pattern 2: Checkmark for Success
```typescript
console.log(`[Context] ✓ Operation completed successfully`);
```

**Used in:** adminAgentInsights, admin/agentOutputs, appLogs, support

**Inconsistency:** No structured logging, no log levels (INFO/WARN/ERROR), no correlation IDs

---

## Dependency Map

### Service Dependencies (10 Services)

#### 1. rankingService.ts
**Used by:** practiceRanking.ts
**Purpose:** Batch ranking computation, competitor analysis

#### 2. rankingAlgorithm.ts
**Used by:** practiceRanking.ts
**Purpose:** Mathematical ranking calculations

#### 3. dataAggregator.ts
**Used by:** practiceRanking.ts, pms.ts
**Purpose:** Combine data from multiple sources (GA4, GSC, GBP, PMS)

#### 4. apifyService.ts
**Used by:** scraper.ts, audit.ts
**Purpose:** Apify API integration for web scraping

#### 5. mail.ts
**Used by:** auth-otp.ts, settings.ts, notificationHelper.ts
**Purpose:** Email sending via n8n webhook

#### 6. s3.ts
**Used by:** admin/media.ts, admin/websites.ts
**Purpose:** AWS S3 file storage

#### 7. mediaProcessor.ts
**Used by:** admin/media.ts
**Purpose:** Image optimization, thumbnails

#### 8. pageEditorService.ts
**Used by:** admin/websites.ts
**Purpose:** Claude AI integration for page editing

#### 9. identifierService.ts
**Used by:** admin/websites.ts
**Purpose:** Generate unique identifiers for projects/pages

#### 10. competitorCache.ts
**Used by:** practiceRanking.ts
**Purpose:** In-memory cache for competitor data

---

### Utility Dependencies (5 Utilities)

#### 1. notificationHelper.ts
**Used by:** support.ts, agentsV2.ts (implicit)
**Exports:** `createNotification()`, `forwardUserInquiry()`
**Dependencies:** mail.ts service

#### 2. pmsAggregator.ts
**Used by:** pms.ts, practiceRanking.ts
**Exports:** `aggregatePMSData()`, `normalizePMSMetrics()`

#### 3. pmsAutomationStatus.ts
**Used by:** pms.ts
**Exports:** `getAutomationStatus()`, `updateAutomationStatus()`

#### 4. weekDates.ts
**Used by:** agentsV2.ts, practiceRanking.ts
**Exports:** `getWeekStartDate()`, `getWeekEndDate()`, `getPreviousWeek()`

#### 5. domainMappings.ts
**Used by:** googleauth.ts
**Exports:** `getDomainForAccount()`, `getAccountForDomain()`

---

### Database Table Access (Most Critical Tables)

#### google_accounts (24 routes)
**Operations:** SELECT, INSERT, UPDATE
**Key columns:** id, user_id, organization_id, email, domain_name, google_property_ids (JSON), scopes, refresh_token, access_token

#### users (11 routes)
**Operations:** SELECT, INSERT, UPDATE
**Key columns:** id, email, name, created_at

#### organizations (6 routes)
**Operations:** SELECT, INSERT, UPDATE, DELETE
**Key columns:** id, name, domain

#### organization_users (6 routes - Junction Table)
**Operations:** SELECT, INSERT, UPDATE, DELETE
**Key columns:** organization_id, user_id, role (admin/manager/viewer)

#### agent_results (3 routes)
**Operations:** SELECT, INSERT, UPDATE, DELETE
**Key columns:** id, google_account_id, domain, agent_type, agent_input (JSON), agent_output (JSON), status

#### agent_recommendations (2 routes)
**Operations:** SELECT, INSERT, UPDATE, DELETE
**Key columns:** id, source_agent_type, agent_under_test, title, explanation, verdict (PASS/FAIL), status (NULL/PASS/REJECT)

#### practice_rankings (1 route - practiceRanking.ts)
**Operations:** SELECT, INSERT (batch 1000+ rows), DELETE
**Key columns:** id, google_account_id, domain, week_start_date, week_end_date, rank_score, rank_position, competitor_data (JSON)

---

### External API Dependencies

#### Google APIs
- **GA4:** `@googleapis/analyticsadmin`, `@googleapis/analyticsdata`
- **GSC:** `googleapis` (searchconsole)
- **GBP:** `@googleapis/mybusinessaccountmanagement`, `@googleapis/mybusinessbusinessinformation`
- **Places:** `@googlemaps/google-maps-services-js`

#### Third-Party APIs
- **Microsoft Clarity:** Clarity REST API (heatmaps, sessions)
- **Apify:** Web scraping actors
- **n8n Webhooks:** Email sending, website deployment
- **Anthropic Claude AI:** Claude 3.5 Sonnet for AI editing
- **AWS S3:** File storage
- **reCAPTCHA:** Spam protection (websiteContact.ts only)

---

## Obsolescence Report

### 🔴 Critical Issues (6 items)

1. **practiceRanking.ts:484, 507, 883, 906** - User email notifications disabled
   - **Impact:** Users don't receive ranking completion notifications
   - **TODO:** REVERT - User email temporarily disabled

2. **agentsV2.ts:413, 466** - Clarity data integration disabled
   - **Impact:** Agents missing Microsoft Clarity insights
   - **Comment:** Temporarily disabled for testing

3. **agentsV2.ts** - Test mode without authentication
   - **Impact:** Anyone can trigger test mode via `?test=true` query param
   - **Risk:** Potential abuse, skips important side effects

4. **practiceRanking.ts:1100-1300** - No transaction for atomic operations
   - **Impact:** If insert fails after delete, rankings are permanently lost
   - **Risk:** Data loss

5. **mail.ts (n8n webhook)** - Single point of failure
   - **Impact:** All emails fail if n8n is down (OTP, invitations, contact forms)
   - **Risk:** Complete email outage

6. **Google APIs** - No caching layer
   - **Impact:** Could hit rate limits during high traffic
   - **Risk:** Service disruption

---

### 🟡 Medium Issues (12 items)

7. **agentsV2.ts:3803** - Deprecated endpoint still active
8. **user/website.ts:251** - Missing token usage tracking (`tokens_used: 0`)
9. **websiteContact.ts, support.ts** - Public endpoints vulnerable to spam (no rate limiting)
10. **Multiple routes** - No input length limits
11. **scraper.ts, audit.ts** - Apify no retry logic
12. **admin/media.ts, admin/websites.ts** - S3 no CDN (high latency for global users)
13. **admin/websites.ts** - Claude API no rate limiting
14. **support.ts** - Missing reCAPTCHA (inconsistent with websiteContact.ts)
15. **appLogs.ts** - File-based logging (no rotation, could fill disk)
16. **auth-otp.ts** - Hardcoded test account (`tester@google.com`)
17. **admin/auth.ts** - Hardcoded pilot token expiry (1 hour)
18. **documentation.ts** - Static documentation export (may be unused)

---

### 🟢 Low Issues (3 items)

19. **imports.ts** - Deprecated import versions (graceful degradation, 410 Gone)
20. **admin/imports.ts** - Explicit "deprecated" status support
21. **agentsV2.ts:463** - Unspecified TODO ("Revert this when needed")

---

## Large Files Deep Dive

### agentsV2.ts (4,161 lines)

**Refactoring Plan:**
1. Extract ClaudeAIService (~600 lines)
2. Extract AgentInputService (~1200 lines)
3. Extract AgentRepository (~400 lines)
4. Extract RecommendationRepository (~300 lines)
5. Create ProoflineController (~300 lines)
6. Create OpportunityController (~300 lines)
7. Create GovernanceController (~600 lines)
8. Create OrchestratorController (~800 lines)

**Expected Outcome:** 1 file (4,161 LOC) → ~12 files (avg ~300 LOC)

---

### practiceRanking.ts (2,172 lines)

**Refactoring Plan:**
1. Extract RankingComputationService (~800 lines)
2. Extract GoogleDataService (~400 lines)
3. Extract CompetitorService (~300 lines)
4. Extract RankingRepository (~400 lines) ⚠️ Add transaction support
5. Create RankingController (~500 lines)
6. Create CompetitorController (~300 lines)
7. Create AdminRankingController (~400 lines)

**Expected Outcome:** 1 file (2,172 LOC) → ~9 files (avg ~250 LOC)

---

### admin/websites.ts (2,771 lines)

**Refactoring Plan:**
1. Extract ProjectService (~400 lines)
2. Extract TemplateService (~500 lines)
3. Extract PageService (~600 lines)
4. Extract PageVersionService (~300 lines)
5. Extract WebsiteScraperService (~200 lines)
6. Extract HFCMService (~400 lines)
7. Extract DeploymentService (~100 lines)
8. Create 6 controllers (~300-500 lines each)

**Expected Outcome:** 1 file (2,771 LOC) → ~15 files (avg ~200 LOC)

---

## Refactoring Roadmap

### Phase 1: Critical Fixes (Week 1-2)
**Priority:** 🔴 Critical
**Effort:** Low
**Impact:** High

1. ✅ **Add transaction support** (practiceRanking.ts:1100-1300)
   ```typescript
   await db.transaction(async (trx) => {
     await trx("practice_rankings").where({ week_start_date, domain }).delete();
     await trx("practice_rankings").insert(rankingsToInsert);
   });
   ```

2. ✅ **Re-enable or remove disabled features**
   - practiceRanking.ts: User email notifications (lines 484, 507, 883, 906)
   - agentsV2.ts: Clarity data integration (lines 413, 466)

3. ✅ **Add authentication to test mode** (agentsV2.ts)
   - Require super admin for `?test=true` query parameter

---

### Phase 2: Service Extraction (Week 3-6)
**Priority:** 🟡 High
**Effort:** High
**Impact:** High

#### Week 3-4: Core Services
4. ✅ **Extract ClaudeAIService** from agentsV2.ts (~600 lines)
   - `callAgent()` - Generic Claude API call
   - `callGovernanceAgent()` - Governance-specific call
   - Rate limiting logic

5. ✅ **Extract AgentInputService** from agentsV2.ts (~1200 lines)
   - `constructProoflineInput()`
   - `constructSummaryInput()`
   - `constructOpportunityInput()`
   - etc. for all 10 agents

6. ✅ **Extract RankingComputationService** from practiceRanking.ts (~800 lines)
   - `computeForPractice()`
   - `computeBatch()`
   - `recomputeAll()`

#### Week 5-6: Supporting Services
7. ✅ **Extract PageEditorService** (already exists, enhance)
8. ✅ **Extract GoogleDataService** from practiceRanking.ts (~400 lines)
9. ✅ **Extract WebsiteScraperService** from admin/websites.ts (~200 lines)
10. ✅ **Extract HFCMService** from admin/websites.ts (~400 lines)

---

### Phase 3: Repository Pattern (Week 7-8)
**Priority:** 🟡 High
**Effort:** Medium
**Impact:** Medium

11. ✅ **Create AgentRepository** (~400 lines)
    - `storeResult()`, `fetchByDomain()`, `fetchRecentResults()`, `bulkDelete()`

12. ✅ **Create RecommendationRepository** (~300 lines)
    - `storeRecommendations()`, `fetchPassedRejectedIds()`, `updateStatus()`

13. ✅ **Create RankingRepository** (~400 lines)
    - `storeWithTransaction()` ⚠️ With transaction support
    - `fetchByDomain()`, `fetchHistory()`, `deleteByWeek()`

14. ✅ **Create ProjectRepository** (~300 lines)
    - Full CRUD for website builder projects

15. ✅ **Create PageRepository** (~400 lines)
    - Full CRUD + versioning for pages

---

### Phase 4: Controller Refactoring (Week 9-12)
**Priority:** 🟢 Medium
**Effort:** High
**Impact:** Medium

#### Week 9-10: Split Large Files
16. ✅ **Split agentsV2.ts** into 6 controllers
    - ProoflineController (~300 lines)
    - OpportunityController (~300 lines)
    - GovernanceController (~600 lines)
    - OrchestratorController (~800 lines)
    - InsightsController (~200 lines)

17. ✅ **Split practiceRanking.ts** into 3 controllers
    - RankingController (~500 lines)
    - CompetitorController (~300 lines)
    - AdminRankingController (~400 lines)

#### Week 11-12: Split Admin/Websites
18. ✅ **Split admin/websites.ts** into 6 controllers
    - ProjectController (~300 lines)
    - TemplateController (~500 lines)
    - PageController (~700 lines)
    - AIEditorController (~400 lines)
    - ScraperController (~200 lines)
    - HFCMController (~600 lines)

---

### Phase 5: Infrastructure Improvements (Week 13-16)
**Priority:** 🟢 Low
**Effort:** Medium
**Impact:** High

19. ✅ **Add caching layer** (Redis or in-memory)
    - Cache Google API responses (5-minute TTL)
    - Cache frequently accessed DB queries

20. ✅ **Add rate limiting** to public endpoints
    - websiteContact.ts: 5 submissions per IP per hour
    - support.ts: 5 inquiries per IP per hour

21. ✅ **Add retry logic** to external services
    - Apify: 3 retries with exponential backoff
    - n8n webhooks: 3 retries with exponential backoff
    - Claude AI: 3 retries with exponential backoff

22. ✅ **Add fallback email provider**
    - Implement SendGrid or AWS SES as backup if n8n fails

23. ✅ **Add CloudFront CDN** for S3 assets
    - Reduce latency for global users

---

### Phase 6: Testing & Documentation (Week 17-20)
**Priority:** 🟢 Low
**Effort:** High
**Impact:** Medium

24. ✅ **Write unit tests** for extracted services
    - Target 80% code coverage

25. ✅ **Write integration tests** for controllers
    - Test API endpoints end-to-end

26. ✅ **Update API documentation**
    - Convert documentation.ts to Swagger/OpenAPI

27. ✅ **Performance testing**
    - Load testing for high-traffic endpoints
    - Optimize slow queries

28. ✅ **Update CLAUDE.md** with new architecture
    - Document new service layer
    - Document repository pattern
    - Document controller structure

---

## Appendices

### Appendix A: Middleware Reference

#### tokenRefreshMiddleware
**File:** `/src/middleware/tokenRefresh.ts`
**Used by:** 19 routes
**Provides:** `req.oauth2Client`, `req.googleAccountId`, `req.userId`
**Purpose:** OAuth2 token validation + automatic refresh

#### rbacMiddleware
**File:** `/src/middleware/rbac.ts`
**Used by:** settings.ts, profile.ts
**Provides:** `req.userRole`
**Functions:** `requireRole(role)`, `canManageRoles()`

#### authenticateToken
**File:** `/src/middleware/auth.ts`
**Used by:** auth.ts, admin/auth.ts
**Provides:** `req.user` (userId, email)

#### superAdminMiddleware
**File:** `/src/middleware/superAdmin.ts`
**Used by:** admin/auth.ts
**Requires:** `SUPER_ADMIN_EMAILS` environment variable

---

### Appendix B: Service Layer Reference

#### rankingService.ts
**Exports:** `computeRankings()`, `analyzeCompetitors()`
**Used by:** practiceRanking.ts

#### dataAggregator.ts
**Exports:** `aggregateData()`, `mergeMetrics()`
**Used by:** practiceRanking.ts, pms.ts

#### apifyService.ts
**Exports:** `runScraperActor()`, `getScraperResults()`
**Used by:** scraper.ts, audit.ts

#### mail.ts
**Exports:** `sendOTP()`, `sendInvitation()`, `forwardUserInquiry()`
**Used by:** auth-otp.ts, settings.ts, notificationHelper.ts

#### s3.ts
**Exports:** `uploadFile()`, `deleteFile()`, `getSignedUrl()`
**Used by:** admin/media.ts, admin/websites.ts

#### mediaProcessor.ts
**Exports:** `processImage()`, `generateThumbnail()`
**Used by:** admin/media.ts

#### pageEditorService.ts
**Exports:** `editPageWithAI()`, `generatePageContent()`
**Used by:** admin/websites.ts

#### identifierService.ts
**Exports:** `generateProjectId()`, `generateSlug()`
**Used by:** admin/websites.ts

#### competitorCache.ts
**Exports:** `getCachedCompetitor()`, `setCachedCompetitor()`
**Used by:** practiceRanking.ts

---

### Appendix C: Database Schema Reference

#### Core Tables
- `users` - User accounts
- `google_accounts` - OAuth2 credentials + practice details (24 routes access this)
- `organizations` - Practice/business entities
- `organization_users` - Junction table for user-org relationships
- `invitations` - Pending user invitations

#### Authentication Tables
- `otp_codes` - One-time password codes for email auth

#### Agent Tables
- `agent_results` - Stored agent execution outputs
- `agent_recommendations` - Guardian/Governance recommendations

#### Data Tables
- `tasks` - Scheduled agent execution tasks
- `notifications` - In-app notifications
- `practice_rankings` - Computed practice rankings
- `pms_data` - Practice Management System data
- `competitors` - Competitor tracking list

#### Website Builder Tables (Schema: `website_builder`)
- `projects` - Website projects
- `pages` - Project pages with HTML content + versions
- `templates` - Reusable page templates
- `template_hfcm` - Template header/footer code snippets
- `project_hfcm` - Project header/footer code snippets
- `admin_settings` - Generic key-value settings

#### Audit Tables
- `website_audit_results` - SEO audit results
- `competitor_scrape_results` - Scraped competitor data

---

### Appendix D: Environment Variables Reference

#### Authentication
- `JWT_SECRET` - Secret key for JWT signing
- `SUPER_ADMIN_EMAILS` - Comma-separated list of super admin emails

#### Google APIs
- `GOOGLE_CLIENT_ID` - OAuth2 client ID
- `GOOGLE_CLIENT_SECRET` - OAuth2 client secret

#### External Services
- `APIFY_API_TOKEN` - Apify API authentication
- `CLARITY_API_KEY` - Microsoft Clarity API key
- `ANTHROPIC_API_KEY` - Claude AI API key
- `RECAPTCHA_SECRET_KEY` - Google reCAPTCHA secret

#### AWS
- `AWS_ACCESS_KEY_ID` - S3 access key
- `AWS_SECRET_ACCESS_KEY` - S3 secret key
- `AWS_S3_BUCKET` - S3 bucket name

#### Email & Webhooks
- `ALLORO_CUSTOM_WEBSITE_EMAIL_WEBHOOK` - n8n email webhook URL
- `N8N_WEBSITE_BUILD_WEBHOOK` - n8n deployment webhook URL
- `CONTACT_FORM_RECIPIENTS` - Comma-separated email list
- `CONTACT_FORM_FROM` - From email address

---

## Conclusion

This analysis provides a comprehensive foundation for the upcoming controller/service refactoring. The roadmap prioritizes critical fixes first, then systematically extracts services, repositories, and controllers to transform the codebase from a monolithic structure into a clean, maintainable architecture.

**Key Takeaways:**
1. **Current State:** 34 route files, 23,239 LOC, 247 endpoints
2. **Target State:** ~80+ files (services + controllers + repositories), avg ~250 LOC per file
3. **Critical Risks:** Data loss (practiceRanking), disabled features, no caching
4. **High-Value Extractions:** ClaudeAIService, AgentInputService, RankingComputationService
5. **Timeline:** 20-week refactoring plan (critical fixes → services → repositories → controllers → infrastructure → testing)

**Next Steps:**
1. Review this analysis with team
2. Approve refactoring roadmap
3. Begin Phase 1: Critical Fixes (Week 1-2)
