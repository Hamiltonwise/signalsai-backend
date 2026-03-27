# SignalsAI Backend - Large Files Deep Dive

**Generated:** 2026-02-18
**Purpose:** Detailed analysis of the 3 largest route files with refactoring recommendations

---

## Table of Contents
1. [agentsV2.ts (4,161 lines)](#agentsv2ts-4161-lines)
2. [practiceRanking.ts (2,172 lines)](#practicerankingtspracticeranking.ts:2172-lines)
3. [admin/websites.ts (2,771 lines)](#adminwebsitests-2771-lines)
4. [Summary and Refactoring Roadmap](#summary-and-refactoring-roadmap)

---

## agentsV2.ts (4,161 lines)

### File Statistics
- **Lines of Code:** 4,161
- **Endpoints:** 10 routes
- **Top-Level Functions:** 25+ helper functions
- **Dependencies:**
  - `@anthropic-ai/sdk` - Claude AI integration
  - `weekDates` utility
  - `notificationHelper` utility
  - Direct database access (7+ tables)

### Purpose
Multi-agent orchestration system with 10 specialized AI agents for practice insights, content generation, and automation.

---

### Endpoint Grouping

#### 1. **Agent Execution Endpoints** (Lines 100-1000)
- `POST /proofline-run` - Generate 7-day practice insights
- `POST /proofline-run-week` - Generate insights for specific week
- `POST /summary-run` - Generate practice summaries
- `POST /opportunity-run` - Identify growth opportunities
- `POST /run-all` - Execute all agents sequentially

**Pattern:** Each endpoint follows this structure:
```typescript
1. Extract googleAccountId from request
2. Fetch domain from google_accounts table
3. Validate inputs
4. Fetch data from multiple sources (GA4, GSC, GBP, PMS)
5. Construct agent input (JSON payload)
6. Call Claude AI with specific system prompt
7. Parse agent output
8. Store result in agent_results table
9. Create notification
10. Return response
```

**Complexity:** ~200-400 lines per agent endpoint

---

#### 2. **Governance Endpoints** (Lines 1000-2000)
- `POST /guardian-run` - Validate agent outputs for quality
- `POST /governance-sentinel-run` - Ensure agent compliance with rules

**Purpose:** Meta-agents that review other agents' outputs
**Pattern:**
```typescript
1. Fetch recent agent_results for target agent
2. Fetch passed/rejected governance IDs
3. Construct governance prompt with examples
4. Run Claude AI governance check
5. Parse recommendations (PASS/FAIL verdicts)
6. Store in agent_recommendations table
7. Return results
```

**Complexity:** ~400-600 lines per governance endpoint

---

#### 3. **Test Endpoints** (Lines 2000-3000)
- `POST /test-all-agents` - Run all agents in test mode (no DB writes)

**Purpose:** Development/debugging tool
**Issue:** Test mode controlled by query parameter (security risk, see Obsolescence Report)

---

#### 4. **Utility Endpoints** (Lines 3000-4000)
- `GET /insights/:domain` - Fetch recent agent results
- `POST /run-scheduled-agents` - Cron job trigger for automated runs
- `POST /bulk-delete-agent-results` - Admin cleanup tool

---

### Function Extraction Opportunities

#### High-Priority Extractions (Business Logic → Service Layer)

1. **`constructProoflineInput()`** (Lines 200-400)
   ```typescript
   // Extract to: AgentInputService.constructProoflineInput()
   async function constructProoflineInput(params: {
     domain: string;
     ga4Data: any;
     gscData: any;
     gbpData: any;
     pmsData: any;
     dateStart: string;
     dateEnd: string;
   }): Promise<ProoflineInput>
   ```

2. **`callClaudeAPI()`** (Lines 500-600)
   ```typescript
   // Extract to: ClaudeAIService.callAgent()
   async function callClaudeAPI(params: {
     systemPrompt: string;
     userPrompt: string;
     model?: string;
     maxTokens?: number;
   }): Promise<string>
   ```

3. **`parseAgentOutput()`** (Lines 700-800)
   ```typescript
   // Extract to: AgentOutputService.parse()
   function parseAgentOutput<T>(rawOutput: string, schema: ZodSchema<T>): T
   ```

4. **`storeAgentResult()`** (Lines 900-1000)
   ```typescript
   // Extract to: AgentRepository.storeResult()
   async function storeAgentResult(params: {
     googleAccountId: number;
     domain: string;
     agentType: string;
     input: any;
     output: any;
     dateStart: string;
     dateEnd: string;
   }): Promise<number> // Returns agent_result ID
   ```

5. **`createAgentNotification()`** (Lines 1100-1200)
   ```typescript
   // Extract to: NotificationService.createAgentNotification()
   async function createAgentNotification(params: {
     domain: string;
     agentType: string;
     status: 'success' | 'error';
     message: string;
   }): Promise<void>
   ```

---

### Endpoint Grouping for Refactoring

#### **ProoflineController** (Lines 100-800)
- POST /proofline-run
- POST /proofline-run-week

**Service Dependencies:**
- `AgentInputService.constructProoflineInput()`
- `ClaudeAIService.callAgent()` with ProoflineAgent prompt
- `AgentRepository.storeResult()`
- `NotificationService.createAgentNotification()`

---

#### **SummaryController** (Lines 800-1200)
- POST /summary-run

**Service Dependencies:** (Same as Proofline)

---

#### **OpportunityController** (Lines 1200-1600)
- POST /opportunity-run

**Service Dependencies:** (Same as Proofline)

---

#### **GovernanceController** (Lines 1600-2400)
- POST /guardian-run
- POST /governance-sentinel-run

**Service Dependencies:**
- `AgentRepository.fetchRecentResults()`
- `GovernanceService.fetchPassedRejectedIds()`
- `ClaudeAIService.callGovernanceAgent()`
- `RecommendationRepository.storeRecommendations()`

---

#### **OrchestratorController** (Lines 2400-3200)
- POST /run-all
- POST /test-all-agents
- POST /run-scheduled-agents

**Service Dependencies:**
- Calls all other controllers internally
- `SchedulerService.getScheduledDomains()`

---

#### **InsightsController** (Lines 3200-4000)
- GET /insights/:domain
- POST /bulk-delete-agent-results

**Service Dependencies:**
- `AgentRepository.fetchByDomain()`
- `AgentRepository.bulkDelete()`

---

### Business Logic Identification

#### Pure Route Handling (10%)
- Request parsing
- Response formatting
- Error handling

#### Domain-Specific Business Rules (60%)
- **Agent prompt construction** (~1500 lines)
  - Each agent has custom system prompts
  - User prompts built from data sources
- **Output parsing and validation** (~800 lines)
  - JSON schema validation
  - Error recovery
- **Governance logic** (~600 lines)
  - Pass/Fail verdict calculation
  - Recommendation storage

#### Infrastructure Logic (30%)
- **Claude API calls** (~400 lines)
- **Database operations** (~800 lines)
- **Date range calculations** (~200 lines)
- **Notification creation** (~150 lines)

---

### State Management

#### In-Memory State
- **None** - All state stored in database

#### Database State
- `agent_results` - Stores all agent execution outputs
- `agent_recommendations` - Stores governance verdicts
- `tasks` - Stores scheduled agent runs

#### External Service State
- **Claude AI API** - Rate limits managed externally

---

### Refactoring Candidates

#### **Phase 1: Extract Services (High Impact)**

1. **ClaudeAIService** (~600 lines)
   - `callAgent()` - Generic Claude API call
   - `callGovernanceAgent()` - Governance-specific call
   - Rate limiting logic
   - Error handling + retries

2. **AgentInputService** (~1200 lines)
   - `constructProoflineInput()`
   - `constructSummaryInput()`
   - `constructOpportunityInput()`
   - etc. for all 10 agents

3. **AgentRepository** (~400 lines)
   - `storeResult()`
   - `fetchByDomain()`
   - `fetchRecentResults()`
   - `bulkDelete()`

4. **RecommendationRepository** (~300 lines)
   - `storeRecommendations()`
   - `fetchPassedRejectedIds()`
   - `updateStatus()`

---

#### **Phase 2: Create Controllers (Medium Impact)**

5. **ProoflineController** (~300 lines)
   - POST /proofline-run
   - POST /proofline-run-week

6. **OpportunityController** (~300 lines)
   - POST /opportunity-run

7. **GovernanceController** (~600 lines)
   - POST /guardian-run
   - POST /governance-sentinel-run

8. **OrchestratorController** (~800 lines)
   - POST /run-all
   - POST /test-all-agents
   - POST /run-scheduled-agents

---

#### **Phase 3: Extract Domain Models (Low Impact)**

9. **AgentModels.ts** (~200 lines)
   - TypeScript interfaces for all agent inputs/outputs
   - Zod schemas for validation

---

### High Coupling Areas

#### **Lines 200-1600: Agent Execution Logic**
- Tight coupling between data fetching, prompt construction, Claude API calls, and result storage
- **Recommendation:** Extract to service layer with clear boundaries

#### **Lines 1600-2400: Governance Logic**
- Tightly coupled with agent_recommendations table
- **Recommendation:** Extract to GovernanceService

---

## practiceRanking.ts (2,172 lines)

### File Statistics
- **Lines of Code:** 2,172
- **Endpoints:** 14 routes
- **Top-Level Functions:** 15+ helper functions
- **Dependencies:**
  - `rankingService.ts`
  - `rankingAlgorithm.ts`
  - `dataAggregator.ts`
  - `competitorCache.ts`
  - `pmsAggregator.ts`
  - `weekDates.ts`
  - Direct database access (5+ tables)

### Purpose
Practice ranking computation system combining Google APIs, PMS data, and competitor analysis.

---

### Endpoint Grouping

#### 1. **Ranking Computation Endpoints** (Lines 100-800)
- `POST /compute` - Compute rankings for current week
- `POST /compute-week` - Compute rankings for specific week
- `POST /compute-batch` - Compute rankings for multiple practices

**Pattern:**
```typescript
1. Extract googleAccountId or batch list
2. Fetch domain and practice details
3. Fetch data from GA4, GSC, GBP, PMS
4. Aggregate data using dataAggregator
5. Query competitor data (cached)
6. Run ranking algorithm
7. Delete old rankings for week (⚠️ NO TRANSACTION)
8. Insert new rankings (batch insert)
9. Send email notification (⚠️ DISABLED, see Obsolescence Report)
10. Return results
```

**Complexity:** ~200-300 lines per endpoint

---

#### 2. **Data Fetching Endpoints** (Lines 800-1400)
- `GET /rankings/:domain` - Fetch computed rankings
- `GET /rankings/:domain/history` - Fetch historical rankings
- `GET /rankings/:domain/competitors` - Fetch competitor rankings

**Purpose:** Read-only endpoints for frontend consumption

---

#### 3. **Competitor Management Endpoints** (Lines 1400-1800)
- `POST /competitors/add` - Add competitor for tracking
- `DELETE /competitors/:id` - Remove competitor
- `POST /competitors/refresh` - Refresh competitor data

**Purpose:** Competitor list management

---

#### 4. **Admin Endpoints** (Lines 1800-2172)
- `POST /admin/recompute-all` - Recompute all practice rankings (⚠️ HIGH LOAD)
- `DELETE /admin/clear-week` - Delete rankings for specific week
- `GET /admin/stats` - Get ranking system statistics

---

### Function Extraction Opportunities

#### High-Priority Extractions

1. **`fetchGoogleData()`** (Lines 300-500)
   ```typescript
   // Extract to: GoogleDataService.fetchAll()
   async function fetchGoogleData(params: {
     oauth2Client: OAuth2Client;
     propertyIds: GooglePropertyIds;
     startDate: string;
     endDate: string;
   }): Promise<GoogleDataAggregate>
   ```

2. **`fetchPMSData()`** (Lines 500-700)
   ```typescript
   // Extract to: PMSDataService.fetch()
   async function fetchPMSData(params: {
     googleAccountId: number;
     domain: string;
     startDate: string;
     endDate: string;
   }): Promise<PMSData>
   ```

3. **`fetchCompetitorData()`** (Lines 700-900)
   ```typescript
   // Extract to: CompetitorService.fetchAll()
   async function fetchCompetitorData(params: {
     competitors: Competitor[];
     oauth2Client: OAuth2Client;
     startDate: string;
     endDate: string;
   }): Promise<CompetitorData[]>
   ```

4. **`computeRankings()`** (Lines 900-1100)
   ```typescript
   // Extract to: RankingComputationService.compute()
   async function computeRankings(params: {
     practiceData: PracticeData;
     competitorData: CompetitorData[];
     algorithm: RankingAlgorithm;
   }): Promise<RankingResult>
   ```

5. **`storeRankings()`** (Lines 1100-1300)
   ```typescript
   // ⚠️ CRITICAL: Extract to: RankingRepository.storeWithTransaction()
   async function storeRankings(params: {
     googleAccountId: number;
     domain: string;
     weekStart: string;
     weekEnd: string;
     rankings: Ranking[];
   }): Promise<void>
   ```

6. **`sendRankingNotification()`** (Lines 1300-1400)
   ```typescript
   // Extract to: RankingNotificationService.send()
   // ⚠️ CURRENTLY DISABLED (see Obsolescence Report)
   async function sendRankingNotification(params: {
     domain: string;
     rankings: Ranking[];
     weekStart: string;
     weekEnd: string;
   }): Promise<void>
   ```

---

### Business Logic Identification

#### Pure Route Handling (15%)
- Request parsing
- Response formatting
- Error handling

#### Domain-Specific Business Rules (50%)
- **Ranking algorithm** (~600 lines in rankingAlgorithm.ts)
  - Weighted scoring
  - Percentile calculations
  - Competitor normalization
- **Data aggregation** (~400 lines)
  - Multi-source data merging
  - Data validation
  - Missing data handling

#### Infrastructure Logic (35%)
- **Google API calls** (~400 lines)
- **Database operations** (~500 lines)
  - Batch inserts (1000+ rows)
  - Complex joins
  - Date range filtering
- **Competitor caching** (~150 lines)

---

### State Management

#### In-Memory State
- **competitorCache** - Caches competitor data to avoid repeated API calls

#### Database State
- `practice_rankings` - Stores computed rankings
- `competitors` - Stores competitor list
- `google_accounts` - Stores practice details and property IDs

#### External Service State
- **Google APIs** - Rate limits managed externally
- **PMS APIs** - Rate limits managed externally

---

### Refactoring Candidates

#### **Phase 1: Extract Services**

1. **RankingComputationService** (~800 lines)
   - `computeForPractice()`
   - `computeBatch()`
   - `recomputeAll()`

2. **GoogleDataService** (~400 lines)
   - `fetchGA4Data()`
   - `fetchGSCData()`
   - `fetchGBPData()`

3. **CompetitorService** (~300 lines)
   - `fetchCompetitorData()`
   - `addCompetitor()`
   - `removeCompetitor()`
   - `refreshCompetitorData()`

4. **RankingRepository** (~400 lines)
   - `storeWithTransaction()` (⚠️ Add transaction support)
   - `fetchByDomain()`
   - `fetchHistory()`
   - `deleteByWeek()`

---

#### **Phase 2: Create Controllers**

5. **RankingController** (~500 lines)
   - POST /compute
   - POST /compute-week
   - POST /compute-batch
   - GET /rankings/:domain
   - GET /rankings/:domain/history

6. **CompetitorController** (~300 lines)
   - POST /competitors/add
   - DELETE /competitors/:id
   - POST /competitors/refresh
   - GET /rankings/:domain/competitors

7. **AdminRankingController** (~400 lines)
   - POST /admin/recompute-all
   - DELETE /admin/clear-week
   - GET /admin/stats

---

### High Coupling Areas

#### **Lines 100-800: Ranking Computation Logic**
- Tight coupling between data fetching, ranking computation, and storage
- **Recommendation:** Extract to RankingComputationService with clear pipeline stages

#### **Lines 800-1400: Competitor Management**
- Tightly coupled with competitorCache and Google APIs
- **Recommendation:** Extract to CompetitorService

---

### Critical Issues

#### **No Transaction for Atomic Operations** (Lines 1100-1300)
```typescript
// ⚠️ CRITICAL BUG: If insert fails after delete, rankings are lost
await db("practice_rankings").where({ week_start_date, domain }).delete();
await db("practice_rankings").insert(rankingsToInsert);
```

**Recommendation:** Wrap in transaction
```typescript
await db.transaction(async (trx) => {
  await trx("practice_rankings").where({ week_start_date, domain }).delete();
  await trx("practice_rankings").insert(rankingsToInsert);
});
```

---

## admin/websites.ts (2,771 lines)

### File Statistics
- **Lines of Code:** 2,771
- **Endpoints:** 47 routes
- **Top-Level Functions:** 20+ helper functions
- **Dependencies:**
  - `s3.ts` service
  - `mediaProcessor.ts` service
  - `pageEditorService.ts` service (Claude AI)
  - `identifierService.ts` service
  - Direct database access (website_builder schema)

### Purpose
Complete website builder system with project management, page CRUD, AI editing, templates, and deployment.

---

### Endpoint Grouping

#### 1. **Project Management** (Lines 100-400) - 5 Endpoints
- `GET /projects` - List all projects
- `POST /projects` - Create new project
- `GET /projects/:id` - Get project details
- `PATCH /projects/:id` - Update project
- `DELETE /projects/:id` - Delete project

---

#### 2. **Template Management** (Lines 400-800) - 8 Endpoints
- `GET /templates` - List all templates
- `POST /templates` - Create template
- `GET /templates/:id` - Get template details
- `PATCH /templates/:id` - Update template
- `DELETE /templates/:id` - Delete template
- `POST /templates/:id/duplicate` - Duplicate template
- `PATCH /templates/:id/activate` - Activate template
- `PATCH /templates/:id/deactivate` - Deactivate template

---

#### 3. **Project Page Management** (Lines 800-1600) - 10 Endpoints
- `GET /projects/:projectId/pages` - List project pages
- `POST /projects/:projectId/pages` - Create page from template
- `GET /projects/:projectId/pages/:pageId` - Get page details
- `PATCH /projects/:projectId/pages/:pageId` - Update page
- `DELETE /projects/:projectId/pages/:pageId` - Delete page
- `POST /projects/:projectId/pages/:pageId/duplicate` - Duplicate page
- `POST /projects/:projectId/pages/:pageId/versions` - Create version snapshot
- `GET /projects/:projectId/pages/:pageId/versions` - List page versions
- `POST /projects/:projectId/pages/:pageId/versions/:versionId/restore` - Restore version
- `DELETE /projects/:projectId/pages/:pageId/versions/:versionId` - Delete version

---

#### 4. **AI Page Editing** (Lines 1600-2000) - 3 Endpoints
- `POST /projects/:projectId/pages/:pageId/edit` - Edit page with Claude AI
- `POST /templates/:templateId/edit` - Edit template with Claude AI
- `GET /ai-status` - Check Claude API status

**Pattern:**
```typescript
1. Fetch page/template HTML
2. Fetch media library images (optional context)
3. Construct prompt with user request + HTML + media context
4. Call Claude AI via pageEditorService
5. Parse edited HTML from response
6. Sanitize HTML (remove scripts, validate structure)
7. Create version snapshot (for pages only)
8. Update database
9. Return edited HTML
```

**Complexity:** ~300-400 lines per AI endpoint

---

#### 5. **Website Scraping** (Lines 2000-2200) - 1 Endpoint
- `POST /scrape` - Scrape existing website to import as template

**Pattern:**
```typescript
1. Fetch URL with Playwright
2. Extract HTML + CSS + images
3. Download images to S3
4. Replace image URLs with S3 URLs
5. Create template from scraped HTML
6. Return template ID
```

---

#### 6. **Pipeline Triggering** (Lines 2200-2300) - 1 Endpoint
- `POST /trigger-pipeline` - Trigger n8n webhook to build/deploy website

**Pattern:**
```typescript
1. Fetch project + all pages
2. Construct payload { project, pages, assets }
3. Send to n8n webhook
4. Return deployment status
```

---

#### 7. **Header/Footer Code Snippets (HFCM)** (Lines 2300-2771) - 12 Endpoints

**Template Snippets** (5 endpoints):
- `GET /templates/:templateId/hfcm` - List template snippets
- `POST /templates/:templateId/hfcm` - Create template snippet
- `PATCH /templates/:templateId/hfcm/:id` - Update template snippet
- `DELETE /templates/:templateId/hfcm/:id` - Delete template snippet
- `PATCH /templates/:templateId/hfcm/:id/toggle` - Enable/disable template snippet

**Project Snippets** (7 endpoints):
- `GET /projects/:projectId/hfcm` - List project snippets
- `POST /projects/:projectId/hfcm` - Create project snippet
- `PATCH /projects/:projectId/hfcm/:id` - Update project snippet
- `DELETE /projects/:projectId/hfcm/:id` - Delete project snippet
- `PATCH /projects/:projectId/hfcm/:id/toggle` - Enable/disable project snippet
- `POST /projects/:projectId/hfcm/copy-from-template` - Copy snippets from template
- `GET /projects/:projectId/summary` - Get project summary (pages + snippets)

---

### Function Extraction Opportunities

#### High-Priority Extractions

1. **`editPageWithAI()`** (Lines 1600-1900)
   ```typescript
   // Already extracted to: pageEditorService.ts
   // But route handler is still ~300 lines
   // Extract to: PageEditorController.editPage()
   ```

2. **`scrapeWebsite()`** (Lines 2000-2200)
   ```typescript
   // Extract to: WebsiteScraperService.scrape()
   async function scrapeWebsite(url: string): Promise<ScrapedWebsite>
   ```

3. **`createVersionSnapshot()`** (Lines 1400-1500)
   ```typescript
   // Extract to: PageVersionService.createSnapshot()
   async function createVersionSnapshot(params: {
     projectId: string;
     pageId: string;
     html: string;
   }): Promise<number>
   ```

4. **`fetchMediaLibrary()`** (Lines 1700-1800)
   ```typescript
   // Extract to: MediaLibraryService.fetchImages()
   async function fetchMediaLibrary(googleAccountId: number): Promise<MediaImage[]>
   ```

5. **`sanitizeHTML()`** (Lines 1900-2000)
   ```typescript
   // Extract to: HTMLSanitizer.sanitize()
   function sanitizeHTML(html: string): string
   ```

6. **`triggerDeploymentPipeline()`** (Lines 2200-2300)
   ```typescript
   // Extract to: DeploymentService.trigger()
   async function triggerDeploymentPipeline(params: {
     projectId: string;
   }): Promise<DeploymentStatus>
   ```

---

### Business Logic Identification

#### Pure Route Handling (20%)
- Request parsing
- Response formatting
- Error handling

#### Domain-Specific Business Rules (50%)
- **Page versioning** (~300 lines)
  - Snapshot creation
  - Version restoration
  - Version history
- **AI editing** (~400 lines)
  - Prompt construction
  - HTML parsing
  - Context injection
- **HTML sanitization** (~200 lines)
  - Script removal
  - Style validation
  - Structure validation

#### Infrastructure Logic (30%)
- **Database operations** (~600 lines)
  - CRUD for projects, pages, templates, snippets
  - Complex joins
- **S3 operations** (~300 lines)
  - Image upload/download
  - Asset management
- **n8n webhook calls** (~100 lines)

---

### State Management

#### In-Memory State
- **None** - All state stored in database

#### Database State
- `website_builder.projects` - Project metadata
- `website_builder.pages` - Page HTML content + versions
- `website_builder.templates` - Reusable templates
- `website_builder.template_hfcm` - Template code snippets
- `website_builder.project_hfcm` - Project code snippets

#### External Service State
- **Claude AI API** - Rate limits managed externally
- **AWS S3** - File storage
- **n8n Webhooks** - Deployment pipeline

---

### Refactoring Candidates

#### **Phase 1: Extract Services**

1. **ProjectService** (~400 lines)
   - `create()`, `update()`, `delete()`, `list()`

2. **TemplateService** (~500 lines)
   - `create()`, `update()`, `delete()`, `list()`
   - `duplicate()`, `activate()`, `deactivate()`

3. **PageService** (~600 lines)
   - `create()`, `update()`, `delete()`, `list()`
   - `duplicate()`

4. **PageVersionService** (~300 lines)
   - `createSnapshot()`, `list()`, `restore()`, `delete()`

5. **PageEditorService** (already exists, ~200 lines)
   - `editPageWithAI()`, `editTemplateWithAI()`

6. **WebsiteScraperService** (~200 lines)
   - `scrape()`, `downloadAssets()`

7. **HFCMService** (~400 lines)
   - Template snippet CRUD
   - Project snippet CRUD
   - `copyFromTemplate()`

8. **DeploymentService** (~100 lines)
   - `triggerPipeline()`, `checkStatus()`

---

#### **Phase 2: Create Controllers**

9. **ProjectController** (~300 lines)
   - GET /projects
   - POST /projects
   - GET /projects/:id
   - PATCH /projects/:id
   - DELETE /projects/:id

10. **TemplateController** (~500 lines)
    - All template endpoints (8 routes)

11. **PageController** (~700 lines)
    - All page CRUD + versioning endpoints (10 routes)

12. **AIEditorController** (~400 lines)
    - POST /projects/:projectId/pages/:pageId/edit
    - POST /templates/:templateId/edit
    - GET /ai-status

13. **ScraperController** (~200 lines)
    - POST /scrape

14. **DeploymentController** (~100 lines)
    - POST /trigger-pipeline

15. **HFCMController** (~600 lines)
    - All HFCM endpoints (12 routes)

---

### High Coupling Areas

#### **Lines 1600-2000: AI Editing Logic**
- Tight coupling between HTML fetching, AI prompt construction, Claude API calls, and HTML sanitization
- **Recommendation:** Extract to PageEditorController with clear service boundaries

#### **Lines 2300-2771: HFCM Snippet Management**
- Highly repetitive code (template snippets vs project snippets)
- **Recommendation:** Abstract into single HFCMService with entity type parameter

---

## Summary and Refactoring Roadmap

### Overall Statistics

| File | LOC | Endpoints | Extractable Services | Extractable Controllers |
|------|-----|-----------|----------------------|-------------------------|
| agentsV2.ts | 4,161 | 10 | 9 services | 6 controllers |
| practiceRanking.ts | 2,172 | 14 | 4 services | 3 controllers |
| admin/websites.ts | 2,771 | 47 | 8 services | 6 controllers |
| **Total** | **9,104** | **71** | **21 services** | **15 controllers** |

---

### Refactoring Priority Matrix

#### 🔴 Critical Priority (High Impact, High Risk)

1. **practiceRanking.ts: Add Transaction Support**
   - **Lines:** 1100-1300
   - **Issue:** Data loss risk if insert fails after delete
   - **Impact:** High - Rankings could be permanently lost
   - **Effort:** Low - Wrap in transaction

2. **agentsV2.ts: Extract ClaudeAIService**
   - **Lines:** 500-600 (repeated 10+ times)
   - **Issue:** Duplicated Claude API call logic
   - **Impact:** High - Affects all 10 agent endpoints
   - **Effort:** Medium - Extract to service

3. **admin/websites.ts: Extract PageEditorController**
   - **Lines:** 1600-2000
   - **Issue:** Complex AI editing logic embedded in route
   - **Impact:** High - Core website builder feature
   - **Effort:** Medium - Extract to controller + service

---

#### 🟡 High Priority (High Impact, Medium Risk)

4. **agentsV2.ts: Extract AgentInputService**
   - **Lines:** 200-1600 (distributed)
   - **Issue:** Duplicated input construction logic
   - **Impact:** High - Affects all agents
   - **Effort:** High - Extract 10+ input constructors

5. **practiceRanking.ts: Extract RankingComputationService**
   - **Lines:** 900-1100
   - **Issue:** Business logic mixed with route handling
   - **Impact:** High - Core ranking feature
   - **Effort:** Medium - Extract computation logic

6. **admin/websites.ts: Extract HFCMService**
   - **Lines:** 2300-2771
   - **Issue:** Highly repetitive code
   - **Impact:** Medium - Code quality + maintainability
   - **Effort:** Medium - Abstract common logic

---

#### 🟢 Medium Priority (Medium Impact, Low Risk)

7. **agentsV2.ts: Create Controllers**
   - **Lines:** 100-4000 (all endpoints)
   - **Issue:** Single file with 10 endpoints
   - **Impact:** Medium - Code organization
   - **Effort:** High - Split into 6 controllers

8. **practiceRanking.ts: Extract Repositories**
   - **Lines:** 1100-1500 (DB operations)
   - **Issue:** Direct DB access in route handlers
   - **Impact:** Medium - Testability + separation of concerns
   - **Effort:** Medium - Create repository classes

9. **admin/websites.ts: Create Controllers**
   - **Lines:** 100-2771 (all endpoints)
   - **Issue:** Single file with 47 endpoints
   - **Impact:** Medium - Code organization
   - **Effort:** High - Split into 6 controllers

---

### Suggested Refactoring Sequence

#### **Week 1-2: Critical Fixes**
1. ✅ Add transaction support to practiceRanking.ts ranking storage
2. ✅ Extract ClaudeAIService from agentsV2.ts

#### **Week 3-4: Service Extraction**
3. ✅ Extract AgentInputService from agentsV2.ts
4. ✅ Extract RankingComputationService from practiceRanking.ts
5. ✅ Extract PageEditorController from admin/websites.ts

#### **Week 5-6: Controller Refactoring**
6. ✅ Split agentsV2.ts into 6 controllers
7. ✅ Split practiceRanking.ts into 3 controllers
8. ✅ Split admin/websites.ts into 6 controllers

#### **Week 7-8: Repository Pattern**
9. ✅ Create AgentRepository, RankingRepository, PageRepository
10. ✅ Replace direct DB calls with repository methods

#### **Week 9-10: Testing & Documentation**
11. ✅ Write unit tests for extracted services
12. ✅ Update API documentation
13. ✅ Performance testing + optimization

---

### Expected Outcomes

#### Before Refactoring
- **3 files:** 9,104 LOC
- **71 endpoints:** All in 3 route files
- **No service layer:** All logic in route handlers
- **No repository pattern:** Direct DB access everywhere
- **High coupling:** Business logic + infrastructure mixed

#### After Refactoring
- **~40 files:** Average ~200-300 LOC per file
- **71 endpoints:** Distributed across 15 controllers
- **21 services:** Clear service layer with single responsibilities
- **8 repositories:** Database access abstraction
- **Low coupling:** Separation of concerns enforced

#### Benefits
- ✅ **Maintainability:** Easier to find and fix bugs
- ✅ **Testability:** Services can be unit tested in isolation
- ✅ **Scalability:** Easier to add new features
- ✅ **Onboarding:** New developers can understand smaller files
- ✅ **Code reuse:** Services can be shared across controllers
- ✅ **Safety:** Transactions prevent data loss

---

## Next Steps

**Phase 7:** Create final consolidated ROUTE_ANALYSIS.md combining all phases
