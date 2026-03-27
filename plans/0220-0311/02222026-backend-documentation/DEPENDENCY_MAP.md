# SignalsAI Backend - Dependency Map

**Generated:** 2026-02-18
**Purpose:** Document relationships between routes, services, utilities, middleware, and database tables

---

## Table of Contents
1. [Service Dependencies](#service-dependencies)
2. [Utility Dependencies](#utility-dependencies)
3. [Middleware Dependencies](#middleware-dependencies)
4. [Database Table Access](#database-table-access)
5. [External API Dependencies](#external-api-dependencies)
6. [Cross-Route Dependencies](#cross-route-dependencies)
7. [Dependency Graph Visualization](#dependency-graph-visualization)

---

## Service Dependencies

### `/src/services/rankingService.ts`
**Used by:**
- `practiceRanking.ts` → Batch ranking computation, competitor analysis

**Purpose:** Primary ranking algorithm execution
**Exports:** `computeRankings()`, `analyzeCompetitors()`

---

### `/src/services/rankingAlgorithm.ts`
**Used by:**
- `practiceRanking.ts` → Core ranking logic

**Purpose:** Mathematical ranking calculations
**Exports:** `calculateScore()`, `normalizeRankings()`

---

### `/src/services/dataAggregator.ts`
**Used by:**
- `practiceRanking.ts` → Aggregate multi-source data
- `pms.ts` → Combine PMS data with Google APIs

**Purpose:** Combine data from multiple sources (GA4, GSC, GBP, PMS)
**Exports:** `aggregateData()`, `mergeMetrics()`

---

### `/src/services/apifyService.ts`
**Used by:**
- `scraper.ts` → Website scraping operations
- `audit.ts` → Competitor website analysis

**Purpose:** Apify API integration for web scraping
**Exports:** `runScraperActor()`, `getScraperResults()`

---

### `/src/services/mail.ts`
**Used by:**
- `auth-otp.ts` → Send OTP codes via email
- `settings.ts` → Send user invitations
- `notificationHelper.ts` (utility) → Forward user inquiries

**Purpose:** Email sending via n8n webhook
**Exports:** `sendOTP()`, `sendInvitation()`, `forwardUserInquiry()`

---

### `/src/services/s3.ts`
**Used by:**
- `admin/media.ts` → Upload/download media files
- `admin/websites.ts` → Store website assets

**Purpose:** AWS S3 file storage operations
**Exports:** `uploadFile()`, `deleteFile()`, `getSignedUrl()`

---

### `/src/services/mediaProcessor.ts`
**Used by:**
- `admin/media.ts` → Image optimization, thumbnails

**Purpose:** Media file processing (resize, compress, format conversion)
**Exports:** `processImage()`, `generateThumbnail()`

---

### `/src/services/pageEditorService.ts`
**Used by:**
- `admin/websites.ts` → AI-powered page editing with Claude

**Purpose:** Claude AI integration for website page editing
**Exports:** `editPageWithAI()`, `generatePageContent()`

---

### `/src/services/identifierService.ts`
**Used by:**
- `admin/websites.ts` → Generate unique identifiers for projects/pages

**Purpose:** UUID/slug generation for website builder
**Exports:** `generateProjectId()`, `generateSlug()`

---

### `/src/services/competitorCache.ts`
**Used by:**
- `practiceRanking.ts` → Cache competitor data to avoid repeated API calls

**Purpose:** In-memory cache for competitor ranking data
**Exports:** `getCachedCompetitor()`, `setCachedCompetitor()`

---

## Utility Dependencies

### `/src/utils/notificationHelper.ts`
**Used by:**
- `support.ts` → Forward user inquiries to admin team
- `agentsV2.ts` (implicit) → Create notifications for agent runs

**Purpose:** Notification creation + email forwarding
**Exports:** `createNotification()`, `forwardUserInquiry()`
**Dependencies:** `services/mail.ts`

---

### `/src/utils/pmsAggregator.ts`
**Used by:**
- `pms.ts` → Aggregate PMS data across multiple sources
- `practiceRanking.ts` → Include PMS metrics in rankings

**Purpose:** Combine data from multiple PMS integrations
**Exports:** `aggregatePMSData()`, `normalizePMSMetrics()`

---

### `/src/utils/pmsAutomationStatus.ts`
**Used by:**
- `pms.ts` → Track PMS automation state machines

**Purpose:** State machine tracking for PMS automation workflows
**Exports:** `getAutomationStatus()`, `updateAutomationStatus()`

---

### `/src/utils/weekDates.ts`
**Used by:**
- `agentsV2.ts` → Calculate week boundaries for agent runs
- `practiceRanking.ts` → Weekly ranking computation

**Purpose:** Date range calculations for weekly operations
**Exports:** `getWeekStartDate()`, `getWeekEndDate()`, `getPreviousWeek()`

---

### `/src/utils/domainMappings.ts`
**Used by:**
- `google auth.ts` → Map OAuth accounts to practice domains

**Purpose:** Domain resolution and mapping
**Exports:** `getDomainForAccount()`, `getAccountForDomain()`

---

## Middleware Dependencies

### `/src/middleware/tokenRefresh.ts`
**Used by:** 19 route files
- settings.ts, profile.ts, onboarding.ts
- ga4.ts, gsc.ts, gbp.ts, clarity.ts
- tasks.ts, pms.ts, practiceRanking.ts, places.ts
- scraper.ts, monday.ts, rag.ts, audit.ts
- user/website.ts, imports.ts, agentsV2.ts (partial)

**Purpose:** OAuth2 token validation + automatic refresh
**Exports:** `tokenRefreshMiddleware`
**Provides:** `req.oauth2Client`, `req.googleAccountId`, `req.userId`

---

### `/src/middleware/rbac.ts`
**Used by:** 2 route files
- settings.ts → User management endpoints
- profile.ts → Profile update endpoints

**Purpose:** Role-Based Access Control (admin/manager/viewer)
**Exports:** `rbacMiddleware`, `requireRole()`, `canManageRoles()`
**Provides:** `req.userRole`

---

### `/src/middleware/auth.ts`
**Used by:** 2 route files
- auth.ts → Basic JWT validation
- admin/auth.ts → Pilot mode impersonation

**Purpose:** Basic JWT token validation without OAuth2
**Exports:** `authenticateToken`
**Provides:** `req.user` (userId, email)

---

### `/src/middleware/superAdmin.ts`
**Used by:** 1 route file
- admin/auth.ts → Pilot mode, admin validation

**Purpose:** Restrict endpoints to super admin emails
**Exports:** `superAdminMiddleware`
**Requires:** `SUPER_ADMIN_EMAILS` environment variable

---

## Database Table Access

### Core Tables

#### `users`
**Accessed by:** 11 route files
- auth-otp.ts → Create users on signup
- auth.ts → Validate user credentials
- settings.ts → Fetch user profiles, manage organization users
- admin/auth.ts → Impersonate users (pilot mode)
- admin/organizations.ts → List users, manage memberships

**Operations:** SELECT, INSERT, UPDATE
**Key columns:** id, email, name, created_at, updated_at

---

#### `google_accounts`
**Accessed by:** 24 route files (most common table)
- All authentication routes (auth.ts, auth-otp.ts, googleauth.ts)
- All Google API routes (ga4.ts, gsc.ts, gbp.ts, clarity.ts)
- All data routes (pms.ts, practiceRanking.ts, tasks.ts, agentsV2.ts)
- Settings and profile routes

**Operations:** SELECT, INSERT, UPDATE
**Key columns:**
- id, user_id, organization_id
- email, domain_name, practice_name
- google_property_ids (JSON: GA4, GSC, GBP config)
- scopes (OAuth2 scopes)
- refresh_token, access_token, token_expiry
- onboarding_completed, onboarding_wizard_completed
- setup_progress (JSON: wizard state)
- phone, operational_jurisdiction
- first_name, last_name

---

#### `organizations`
**Accessed by:** 6 route files
- onboarding.ts → Create organizations
- settings.ts → Fetch organization details
- admin/organizations.ts → Manage organizations
- admin/auth.ts → Organization context for pilot mode

**Operations:** SELECT, INSERT, UPDATE, DELETE
**Key columns:** id, name, domain, created_at, updated_at

---

#### `organization_users` (Junction Table)
**Accessed by:** 6 route files
- auth-otp.ts → Link users to organizations on signup
- settings.ts → Manage user roles
- admin/organizations.ts → Organization membership

**Operations:** SELECT, INSERT, UPDATE, DELETE
**Key columns:** organization_id, user_id, role (admin/manager/viewer), created_at

---

#### `invitations`
**Accessed by:** 3 route files
- auth-otp.ts → Check for pending invitations on signup
- settings.ts → Create, list invitations

**Operations:** SELECT, INSERT, UPDATE, DELETE
**Key columns:** email, organization_id, role, token, status (pending/accepted), expires_at

---

### Authentication Tables

#### `otp_codes`
**Accessed by:** 1 route file
- auth-otp.ts → Store and verify OTP codes

**Operations:** INSERT, SELECT, UPDATE
**Key columns:** email, code, expires_at, used, created_at

---

### Agent Tables

#### `agent_results`
**Accessed by:** 3 route files
- agentsV2.ts → Store agent execution results
- admin/agentOutputs.ts → View, archive, delete agent outputs
- adminAgentInsights.ts → Clear month data

**Operations:** SELECT, INSERT, UPDATE, DELETE
**Key columns:**
- id, google_account_id, domain
- agent_type (proofline, summary, opportunity, etc.)
- agent_input (JSON), agent_output (JSON)
- date_start, date_end
- status (success/pending/error/archived)
- error_message, created_at, updated_at

---

#### `agent_recommendations`
**Accessed by:** 2 route files
- agentsV2.ts → Store Guardian/Governance recommendations
- adminAgentInsights.ts → View, manage, track recommendations

**Operations:** SELECT, INSERT, UPDATE, DELETE
**Key columns:**
- id, source_agent_type (guardian/governance_sentinel)
- agent_under_test (opportunity, proofline, etc.)
- title, explanation, evidence_links (JSON)
- verdict (PASS/FAIL), confidence (0.0-1.0)
- status (NULL/PASS/REJECT)
- completed_at, created_at, updated_at

---

### Data Tables

#### `tasks`
**Accessed by:** 1 route file
- tasks.ts → Manage agent execution tasks

**Operations:** SELECT, INSERT, UPDATE, DELETE
**Key columns:**
- id, google_account_id, domain
- agent_type, status (pending/running/completed/failed)
- scheduled_for, started_at, completed_at
- result (JSON), error_message

---

#### `notifications`
**Accessed by:** 2 route files
- notifications.ts → CRUD operations
- notificationHelper.ts (utility) → Create notifications

**Operations:** SELECT, INSERT, UPDATE, DELETE
**Key columns:**
- id, google_account_id, domain_name
- title, message, type (system/alert/info)
- metadata (JSON)
- read (boolean), read_timestamp
- created_at, updated_at

---

#### `practice_rankings`
**Accessed by:** 1 route file
- practiceRanking.ts → Store computed practice rankings

**Operations:** SELECT, INSERT, UPDATE, DELETE (bulk)
**Key columns:**
- id, google_account_id, domain
- week_start_date, week_end_date
- rank_score, rank_position
- competitor_data (JSON)
- ga4_metrics (JSON), gsc_metrics (JSON), gbp_metrics (JSON)
- created_at, updated_at

---

#### `pms_data`
**Accessed by:** 2 route files
- pms.ts → Store and retrieve PMS data
- imports.ts → Import PMS data from CSV/API

**Operations:** SELECT, INSERT, UPDATE
**Key columns:**
- id, google_account_id, domain
- source (practiceview, weave, etc.)
- record_data (JSON)
- status (active/deprecated)
- sync_date, created_at, updated_at

---

### Website Builder Tables (Schema: `website_builder`)

#### `website_builder.projects`
**Accessed by:** 1 route file
- admin/websites.ts → Manage website projects

**Operations:** SELECT, INSERT, UPDATE, DELETE
**Key columns:**
- id, project_id (UUID), slug
- name, description, status (draft/published)
- domain_name, google_account_id
- created_at, updated_at

---

#### `website_builder.pages`
**Accessed by:** 1 route file
- admin/websites.ts → Manage website pages

**Operations:** SELECT, INSERT, UPDATE, DELETE
**Key columns:**
- id, project_id, page_id (UUID)
- slug, title, html_content
- version, is_latest_version
- created_at, updated_at

---

#### `website_builder.templates`
**Accessed by:** 1 route file
- admin/websites.ts → Manage page templates

**Operations:** SELECT, INSERT, UPDATE, DELETE
**Key columns:**
- id, name, description
- html_content, thumbnail_url
- category, is_active

---

#### `website_builder.admin_settings`
**Accessed by:** 1 route file
- admin/settings.ts → Generic key-value settings

**Operations:** SELECT, INSERT (upsert)
**Key columns:** category, key, value, updated_at

---

### Audit Tables

#### `website_audit_results`
**Accessed by:** 1 route file
- audit.ts → Store website audit results

**Operations:** SELECT, INSERT
**Key columns:**
- id, google_account_id, domain
- audit_data (JSON), score
- created_at

---

#### `competitor_scrape_results`
**Accessed by:** 1 route file
- scraper.ts → Store scraped competitor data

**Operations:** SELECT, INSERT
**Key columns:**
- id, google_account_id, domain
- competitor_url, scraped_data (JSON)
- created_at

---

### Log Tables

#### `app_logs` (file-based, not DB table)
**Accessed by:** 1 route file
- appLogs.ts → Read log files from filesystem

**Log files:**
- `/logs/agent-run.log`
- `/logs/email.log`
- `/logs/scraping-tool.log`
- `/logs/website-scrape.log`

---

## External API Dependencies

### Google APIs

#### **Google Analytics 4 (GA4)**
**Routes:** ga4.ts
**Library:** `@googleapis/analyticsadmin`, `@googleapis/analyticsdata`
**Endpoints Used:**
- `analyticsAdmin.accountSummaries.list()` → List all GA4 properties
- `analyticsData.runReport()` → Query GA4 data

---

#### **Google Search Console (GSC)**
**Routes:** gsc.ts
**Library:** `googleapis` (searchconsole)
**Endpoints Used:**
- `searchconsole.sites.list()` → List all GSC properties
- `searchconsole.searchanalytics.query()` → Query search performance data

---

#### **Google Business Profile (GBP)**
**Routes:** gbp.ts, practiceRanking.ts
**Library:** `@googleapis/mybusinessaccountmanagement`, `@googleapis/mybusinessbusinessinformation`
**Endpoints Used:**
- `mybusinessaccountmanagement.accounts.list()` → List GBP accounts
- `mybusinessbusinessinformation.accounts.locations.list()` → List locations
- `mybusinessbusinessinformation.locations.fetchMultiDailyMetricsTimeSeries()` → Performance metrics

---

#### **Google Places API**
**Routes:** places.ts
**Library:** `@googlemaps/google-maps-services-js`
**Endpoints Used:**
- `placesNearbySearch()` → Find nearby competitors
- `placeDetails()` → Get place details

---

### Third-Party APIs

#### **Microsoft Clarity**
**Routes:** clarity.ts
**API:** Clarity REST API
**Authentication:** API Key
**Endpoints Used:**
- `GET /v1/projects/{projectId}/heatmaps` → Fetch heatmap data
- `GET /v1/projects/{projectId}/sessions` → Fetch session recordings

---

#### **Apify**
**Routes:** scraper.ts, audit.ts
**Service:** `apifyService.ts`
**Purpose:** Web scraping, competitor analysis
**Actors Used:**
- Website Content Scraper
- SEO Audit Actor
- Competitor Analysis Actor

---

#### **n8n Webhooks**
**Routes:** websiteContact.ts, admin/websites.ts
**Purpose:** Email sending, workflow automation
**Webhooks:**
- `ALLORO_CUSTOM_WEBSITE_EMAIL_WEBHOOK` → Contact form emails
- `N8N_WEBSITE_BUILD_WEBHOOK` → Trigger website build pipeline

---

#### **Anthropic Claude AI**
**Routes:** admin/websites.ts
**Service:** `pageEditorService.ts`
**Purpose:** AI-powered page editing
**Model:** Claude 3.5 Sonnet

---

#### **AWS S3**
**Routes:** admin/media.ts, admin/websites.ts
**Service:** `s3.ts`
**Purpose:** File storage for media and website assets

---

#### **reCAPTCHA**
**Routes:** websiteContact.ts
**Purpose:** Spam protection on public contact forms
**Endpoint:** `https://www.google.com/recaptcha/api/siteverify`

---

## Cross-Route Dependencies

### Internal HTTP Calls
**None found.** All routes operate independently without calling other routes.

### Shared Helper Functions

#### `handleError()` (Defined in 23 route files)
**Pattern:** Copy-pasted error handler function
**Issue:** Duplicated code across files
**Recommendation:** Extract to shared utility

#### `getDomainFromAccountId()` (Defined in notifications.ts)
**Pattern:** Helper function to get domain from google_account_id
**Issue:** Should be extracted to utility
**Potential users:** All routes using domain filtering

---

## Dependency Graph Visualization

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         ROUTE LAYER (34 files)                  │
│  Authentication │ Google APIs │ PMS │ Agents │ Admin │ User    │
└─────────┬───────────────────┬────────────┬──────────┬──────────┘
          │                   │            │          │
          ▼                   ▼            ▼          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      MIDDLEWARE LAYER (4 files)                 │
│  tokenRefreshMiddleware │ rbacMiddleware │ auth │ superAdmin   │
└─────────┬───────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SERVICE LAYER (10 files)                   │
│  Ranking │ Data Aggregation │ Email │ Apify │ S3 │ AI Editor  │
└─────────┬───────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      UTILITY LAYER (5 files)                    │
│  Notifications │ PMS Aggregator │ Domain Mappings │ Week Dates │
└─────────┬───────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      DATABASE LAYER (PostgreSQL)                │
│  Core │ Auth │ Agents │ Data │ Website Builder │ Audit         │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      EXTERNAL APIS                              │
│  Google (GA4, GSC, GBP) │ Apify │ n8n │ Claude │ S3 │ reCAPTCHA│
└─────────────────────────────────────────────────────────────────┘
```

### Service Usage Matrix

| Route File | Services Used | Utilities Used | Middleware Used |
|------------|---------------|----------------|-----------------|
| **practiceRanking.ts** | rankingService, rankingAlgorithm, dataAggregator, competitorCache | pmsAggregator, weekDates | tokenRefreshMiddleware |
| **agentsV2.ts** | - | weekDates, notificationHelper | tokenRefreshMiddleware (partial) |
| **pms.ts** | dataAggregator | pmsAggregator, pmsAutomationStatus | tokenRefreshMiddleware |
| **admin/websites.ts** | s3, mediaProcessor, pageEditorService, identifierService | - | - |
| **settings.ts** | mail | - | tokenRefreshMiddleware, rbacMiddleware |
| **auth-otp.ts** | mail | - | - |
| **scraper.ts** | apifyService | - | tokenRefreshMiddleware |
| **audit.ts** | apifyService | - | tokenRefreshMiddleware |
| **admin/media.ts** | s3, mediaProcessor | - | - |
| **support.ts** | - | notificationHelper (→ mail) | - |
| **websiteContact.ts** | - | - | - |

### Database Table Usage Matrix

| Table | Primary Routes | Read Operations | Write Operations |
|-------|----------------|-----------------|------------------|
| **google_accounts** | 24 routes | 500+ | 50+ |
| **users** | 11 routes | 100+ | 20+ |
| **organizations** | 6 routes | 50+ | 15+ |
| **organization_users** | 6 routes | 40+ | 20+ |
| **agent_results** | 3 routes | 200+ | 100+ |
| **agent_recommendations** | 2 routes | 150+ | 50+ |
| **tasks** | 1 route (tasks.ts) | 100+ | 50+ |
| **notifications** | 2 routes | 50+ | 30+ |
| **practice_rankings** | 1 route (practiceRanking.ts) | 50+ | 1000+ (batch) |
| **pms_data** | 2 routes | 200+ | 100+ |
| **website_builder.projects** | 1 route (admin/websites.ts) | 100+ | 50+ |
| **website_builder.pages** | 1 route (admin/websites.ts) | 200+ | 100+ |

---

## Critical Dependencies Summary

### Most Dependent Routes (by external dependencies)
1. **practiceRanking.ts** → 4 services, 3 utilities, 3 Google APIs, 10+ DB tables
2. **agentsV2.ts** → 2 utilities, 5+ DB tables, complex orchestration logic
3. **admin/websites.ts** → 4 services, 5+ DB tables, Claude AI, n8n webhooks
4. **pms.ts** → 2 services, 2 utilities, 3+ DB tables

### Most Critical Services (by route usage)
1. **tokenRefreshMiddleware** → Used by 19 routes
2. **mail.ts** → Used by 3 routes + notificationHelper utility
3. **dataAggregator.ts** → Used by practiceRanking.ts, pms.ts
4. **apifyService.ts** → Used by scraper.ts, audit.ts

### Most Critical Tables (by route access)
1. **google_accounts** → Accessed by 24 routes (71% of all routes)
2. **users** → Accessed by 11 routes (32%)
3. **organizations** → Accessed by 6 routes (18%)
4. **agent_results** → Accessed by 3 routes (9%)

### Bottleneck Risks
1. **Google API Rate Limits** → No caching layer, every request hits Google APIs
2. **Database Connection Pool** → 829 direct queries across 34 routes
3. **Email Service (n8n webhook)** → Single point of failure for all emails
4. **S3 Storage** → No CDN, direct S3 access for media files

---

## Recommendations

### 1. Introduce Repository Pattern
- Extract database access into repository classes
- Reduce 829 direct Knex queries to ~50 repository methods
- Example: `UserRepository`, `OrganizationRepository`, `AgentRepository`

### 2. Add Service Layer
- Extract business logic from routes to services
- Example: `UserManagementService`, `RankingComputationService`

### 3. Implement Caching Layer
- Cache Google API responses (Redis or in-memory)
- Cache frequently accessed DB queries (google_accounts, organizations)
- Reduce API rate limit risk

### 4. Centralize Shared Utilities
- Extract `handleError()` to shared utility (used in 23 files)
- Extract `getDomainFromAccountId()` to shared utility
- Create `ValidationService` for input validation

### 5. Add Circuit Breakers
- Protect against Google API failures
- Protect against n8n webhook failures
- Graceful degradation for non-critical services

### 6. Implement Dependency Injection
- Replace direct imports with dependency injection
- Easier testing and mocking
- Clearer dependency relationships

---

## Next Steps

**Phase 5:** Obsolescence Detection (identify deprecated/broken routes)
**Phase 6:** Large Files Deep Dive (agentsV2.ts, practiceRanking.ts, admin/websites.ts)
**Phase 7:** Final Consolidated Report (ROUTE_ANALYSIS.md)
