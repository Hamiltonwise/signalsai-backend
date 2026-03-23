# AgentsV2 Route Refactor Plan

## Current State

### Overview
- **File**: `/signalsai-backend/src/routes/agentsV2.ts`
- **LOC**: 4,161 lines (LARGEST route file in codebase)
- **Endpoints**: 15 total (10 POST, 2 GET, 0 PUT, 0 DELETE)
- **Agent Types**: 10 specialized AI agents (proofline, summary, opportunity, guardian, governance, referral_engine, cro_optimizer, copy_companion, identifier, ranking)
- **Complexity**: Multi-agent orchestration system with sequential execution, governance validation, batch processing, retry logic

### Endpoint Breakdown

#### Production Endpoints (9)
1. `POST /api/agents/proofline-run` - Daily proofline agent for all clients (lines 1954-2085)
2. `POST /api/agents/monthly-agents-run` - Monthly agents (Summary + Opportunity + Referral Engine + CRO Optimizer) for single client (lines 2098-2434)
3. `POST /api/agents/gbp-optimizer-run` - Monthly GBP copy optimizer for all clients (lines 2869-3104)
4. `POST /api/agents/ranking-run` - Automated practice ranking agent (lines 3116-3341)
5. `POST /api/agents/guardian-governance-agents-run` - System-wide monthly quality assurance agents (lines 3357-3798)
6. `GET /api/agents/latest/:googleAccountId` - Fetch latest successful agent outputs (lines 3913-3999)
7. `GET /api/agents/getLatestReferralEngineOutput/:googleAccountId` - Fetch latest referral engine output (lines 4007-4130)
8. `GET /api/agents/health` - Health check endpoint (lines 4140-4155)

#### Testing/Development Endpoints (2)
9. `POST /api/agents/monthly-agents-run-test` - Test endpoint (NO DB writes, NO emails) (lines 2448-2731)

#### Deprecated Endpoints (1)
10. `POST /api/agents/process-all` - Deprecated, use /proofline-run instead (lines 3810-3905)

### Current Dependencies
- `express` - Router and types
- `../database/connection` - Direct database access via `db()`
- `../auth/oauth2Helper` - OAuth2 client creation and validation
- `../services/dataAggregator` - Google data fetching (GA4, GBP, GSC)
- `../utils/pmsAggregator` - PMS data aggregation
- `../utils/notificationHelper` - User and admin notifications
- `../services/rankingService` - Practice ranking analysis
- `../utils/pmsAutomationStatus` - PMS automation status tracking
- `@anthropic-ai/sdk` - Claude AI integration (imported but not directly used in route file)
- `axios` - HTTP client for webhook calls
- `fs`, `path` - File system operations for logging
- `uuid` - UUID generation for batch IDs

### Configuration Constants (Lines 54-78)
```typescript
LOG_DIR, LOG_FILE                          // File logging paths
PROOFLINE_WEBHOOK                          // Daily agent
SUMMARY_WEBHOOK                            // Monthly agent
REFERRAL_ENGINE_WEBHOOK                    // Monthly agent
OPPORTUNITY_WEBHOOK                        // Monthly agent
CRO_OPTIMIZER_WEBHOOK                      // Monthly agent
COPY_COMPANION_WEBHOOK                     // GBP optimizer agent
GUARDIAN_AGENT_WEBHOOK                     // Quality assurance agent
GOVERNANCE_AGENT_WEBHOOK                   // Quality assurance agent
IDENTIFIER_AGENT_WEBHOOK                   // Location metadata agent
MONTH_PMS_DATA_AVAILABLE                   // PMS data flag (always true)
```

### Current Responsibilities
The route file currently handles:
1. Route definitions (15 endpoints)
2. Request validation (body params, URL params, query params)
3. Direct database queries (35+ db() calls across multiple tables)
4. Business logic (agent orchestration, data aggregation, task creation)
5. External service orchestration (10+ webhook agents, OAuth2, Google APIs)
6. File system logging (custom log() and logError() functions)
7. Error handling and response formatting
8. Data validation and normalization
9. Retry logic with exponential backoff
10. Duplicate detection and prevention
11. Test mode simulation (monthly-agents-run-test)
12. Sequential vs. parallel processing strategies
13. Complex state management (automation status tracking)
14. Task creation from agent outputs (3 different agent types)
15. Recommendation parsing and storage (Guardian/Governance agents)

### Inline Utility Functions (Lines 84-695)

#### Logging Functions (Lines 84-107)
1. **log(message: string)** (lines 84-94): File + console logging
2. **logError(operation: string, error: any)** (lines 96-100): Error logging with stack traces
3. **delay(ms: number)** (lines 105-107): Promise-based delay for retries

#### Output Validation (Lines 113-171)
4. **isValidAgentOutput(output: any, agentType: string)** (lines 117-159): Validates agent output is not empty
5. **logAgentOutput(agentType: string, output: any)** (lines 164-171): Logs agent output with truncation

#### Date Helpers (Lines 175-249)
6. **formatDate(d: Date)** (lines 177-179): ISO date formatting
7. **getDailyDates(referenceDate?: string)** (lines 184-198): Yesterday and day before yesterday
8. **getPreviousMonthRange(referenceDate?: string)** (lines 203-215): Previous month date range
9. **shouldRunMonthlyAgents(referenceDate?: string)** (lines 221-232): Monthly agent trigger conditions
10. **getCurrentMonthRange()** (lines 237-249): Current month date range (1st to today)

#### Agent Webhook Functions (Lines 253-358)
11. **callAgentWebhook(webhookUrl: string, payload: any, agentName: string)** (lines 258-283): Generic webhook caller with 10min timeout
12. **identifyLocationMeta(gbpData: any, domain: string)** (lines 288-334): Call Identifier Agent for specialty/market
13. **getFallbackMeta(gbpData: any)** (lines 339-347): Fallback metadata when Identifier fails
14. **getFallbackMarket(gbpData: any)** (lines 352-358): Extract city/state from GBP address

#### Payload Builders (Lines 362-518)
15. **buildProoflinePayload(params)** (lines 367-387): Proofline daily agent payload
16. **buildSummaryPayload(params)** (lines 392-416): Summary monthly agent payload (includes PMS, Clarity)
17. **buildOpportunityPayload(params)** (lines 421-439): Opportunity agent payload (uses Summary output)
18. **buildReferralEnginePayload(params)** (lines 445-469): Referral Engine payload (same as Summary)
19. **buildCroOptimizerPayload(params)** (lines 475-492): CRO Optimizer payload (uses Summary output)
20. **buildGuardianGovernancePayload(agentUnderTest, outputs, passedRecs?, rejectedRecs?)** (lines 498-518): Guardian/Governance payload with historical context

#### Recommendation Parsing (Lines 525-695)
21. **saveRecommendationsFromAgents(guardianResultId, governanceResultId, guardianResults, governanceResults)** (lines 525-695): Parse and save recommendations to agent_recommendations table (massive 170-line function with nested loops, error handling, failsafe logic)

### Core Processing Functions (Lines 699-1940)

#### Daily Agent Processing (Lines 705-812)
22. **processDailyAgent(account, oauth2Client, dates)** (lines 705-812):
   - Returns: `{ success, output?, payload?, rawData?, error? }`
   - Fetches 2 days of data (yesterday + day before yesterday)
   - Calls Proofline webhook
   - Validates output
   - Returns data in memory (NO DB writes)

#### Monthly Agents Processing (Lines 818-1365)
23. **processMonthlyAgents(account, oauth2Client, monthRange)** (lines 818-1365):
   - Returns: `{ success, summaryOutput?, referralEngineOutput?, opportunityOutput?, croOptimizerOutput?, payloads..., rawData?, skipped?, error? }`
   - **SEQUENTIAL EXECUTION**: Summary → Referral Engine → Opportunity → CRO Optimizer (with 3 retries)
   - Fetches GA4/GBP/GSC/PMS/Clarity data
   - Creates tasks from all 3 agent outputs (Opportunity, CRO Optimizer, Referral Engine)
   - Returns data in memory (NO DB writes)
   - **Complexity**: 547 lines, handles 4 agents, 3 task creation flows, retry logic

#### GBP Optimizer Functions (Lines 1369-1659)
24. **buildCopyCompanionPayload(gbpData, domain, googleAccountId)** (lines 1374-1450): Transform GBP data to Copy Companion format
25. **processGBPOptimizerAgent(account, oauth2Client, monthRange)** (lines 1455-1549): Fetch GBP posts and call Copy Companion agent
26. **createTasksFromCopyRecommendations(agentOutput, googleAccountId, domain)** (lines 1554-1659): Create tasks from Copy Companion recommendations

#### Client Processing with Retry (Lines 1666-1939)
27. **processClient(account, referenceDate?)** (lines 1666-1939):
   - **Complexity**: 273 lines with 3-attempt retry logic
   - Orchestrates daily + monthly agents
   - Validates ALL outputs before saving to DB
   - Saves to DB only after ALL validations pass
   - Handles duplicate detection
   - Returns: `{ success, daily?, monthly?, error?, attempts? }`

#### Test Mode Simulation (Lines 2736-2856)
28. **simulateTaskCreation(agentOutputs)** (lines 2736-2856): Simulates task creation for test endpoint (NO DB writes)

### Database Tables Used
**Direct `db()` calls to 7 tables**:
1. **google_accounts** (7 calls): Account fetching, validation
2. **agent_results** (15 calls): Save agent outputs, duplicate detection, fetch latest
3. **google_data_store** (6 calls): Save raw Google API data
4. **tasks** (8 calls): Create tasks from agent recommendations, count tasks
5. **agent_recommendations** (4 calls): Save Guardian/Governance recommendations, fetch historical context
6. **pms_jobs** (2 calls): Check automation status, update progress
7. **practice_rankings** (4 calls): Create ranking records, update status

### Database Call Details

#### GET Queries (22 total)
- **google_accounts.where("onboarding_completed", true)** (4 occurrences): Fetch all onboarded accounts
- **google_accounts.where({ id: googleAccountId })** (3 occurrences): Fetch single account
- **agent_results.where({ ... }).whereIn("status", ["success", "pending"])** (8 occurrences): Duplicate detection
- **agent_results.where({ google_account_id, agent_type, status: "success" }).orderBy("created_at", "desc")** (2 occurrences): Latest agent results
- **agent_results.whereBetween("created_at", [...]).where("status", "success")** (1 occurrence): Guardian/Governance input
- **tasks.where("domain_name", domain).where("created_at", ">=", startTime)** (1 occurrence): Count recently created tasks
- **agent_recommendations.where("agent_under_test", agentType).where("status", "PASS/REJECT")** (2 occurrences): Historical recommendations
- **pms_jobs.where({ domain }).whereRaw(...)** (1 occurrence): Check active automation

#### INSERT Queries (13 total)
- **google_data_store.insert(rawData)** (6 occurrences): Raw Google API data
- **agent_results.insert({ ... }).returning("id")** (7 occurrences): Agent results (proofline, summary, opportunity, referral_engine, cro_optimizer, guardian, governance)
- **tasks.insert(taskData).returning("id")** (multiple in loops): Individual task creation
- **agent_recommendations.insert(recommendations)** (1 occurrence): Bulk recommendation insert
- **practice_rankings.insert({ ... }).returning("id")** (1 occurrence in loop): Ranking records

#### UPDATE Queries (4 total)
- **practice_rankings.where({ id: rankingId }).update({ status, status_detail })** (2 occurrences): Update ranking status

### Security Concerns
1. **Test mode accessible via query parameter without auth** (monthly-agents-run-test endpoint)
2. **No explicit rate limiting on webhook calls** (10+ external agents)
3. **Environment variables for webhooks not validated at startup** (fails at runtime)
4. **PMS Job automation status updates not atomic** (potential race conditions)
5. **Duplicate detection uses whereIn("status", ["success", "pending"])** (not transactional)

### Performance Characteristics
- **Sequential processing**: All clients processed sequentially to avoid API rate limits
- **Retry logic**: 3 attempts for most operations with 30-second delays
- **Webhook timeouts**: 10 minutes (600,000ms) for agent webhooks
- **Duplicate detection**: Runs before each agent to prevent reruns
- **Batch processing**: Ranking agent creates all records upfront, then processes sequentially
- **File logging**: Synchronous fs.appendFileSync() on every log call (potential bottleneck)

### Disabled/Commented Features
1. **Clarity data integration**: Temporarily disabled in Summary and Referral Engine payloads (lines 413, 466)
2. **GA4/GBP/GSC data in Referral Engine**: Commented out (line 464) - "TODO: Revert this when needed"

---

## Target Architecture

```
signalsai-backend/src/
├── routes/
│   └── agentsV2.ts                                  # Route definitions only (~200 LOC)
├── controllers/
│   └── agents/
│       ├── AgentsController.ts                      # Main controller entry point (~400 LOC)
│       ├── feature-services/
│       │   ├── service.claude-ai.ts                 # Claude AI integration (~150 LOC)
│       │   ├── service.webhook-orchestrator.ts      # Webhook calls with retry (~200 LOC)
│       │   ├── service.agent-input-builder.ts       # Payload builders (~350 LOC)
│       │   ├── service.agent-orchestrator.ts        # Multi-agent sequential execution (~500 LOC)
│       │   ├── service.agent-validator.ts           # Output validation (~100 LOC)
│       │   ├── service.task-creator.ts              # Task creation from agent outputs (~400 LOC)
│       │   ├── service.recommendation-parser.ts     # Recommendation parsing (~250 LOC)
│       │   ├── service.governance-validator.ts      # Guardian/Governance orchestration (~300 LOC)
│       │   ├── service.data-aggregator.ts           # Google data + PMS aggregation (~200 LOC)
│       │   ├── service.ranking-processor.ts         # Ranking analysis orchestration (~300 LOC)
│       │   ├── service.location-identifier.ts       # Location metadata identification (~150 LOC)
│       │   └── service.gbp-optimizer.ts             # GBP copy optimization (~250 LOC)
│       └── feature-utils/
│           ├── agentLogger.ts                       # File + console logging (~80 LOC)
│           ├── dateHelpers.ts                       # Date range calculations (~100 LOC)
│           ├── validationUtils.ts                   # Request validation (~150 LOC)
│           ├── retryUtils.ts                        # Retry logic with exponential backoff (~80 LOC)
│           ├── duplicateDetector.ts                 # Duplicate detection logic (~100 LOC)
│           └── testSimulator.ts                     # Test mode simulation (~150 LOC)
├── models/
│   ├── GoogleAccountModel.ts                        # EXISTS - add methods
│   ├── AgentResultModel.ts                          # EXISTS - add methods
│   ├── TaskModel.ts                                 # EXISTS - add methods
│   ├── AgentRecommendationModel.ts                  # EXISTS - add methods
│   ├── GoogleDataStoreModel.ts                      # NEW
│   └── PracticeRankingModel.ts                      # EXISTS
```

**Estimated Total LOC After Refactor**: ~4,500 LOC (increase due to proper separation, types, error handling)
- Route file: ~200 LOC (95% reduction)
- Controller: ~400 LOC
- Services: ~3,150 LOC
- Utils: ~660 LOC
- Models: ~90 LOC additions

---

## Mapping

### Route File (`routes/agentsV2.ts`)
**Keeps**:
- Route definitions (15 routes)
- Router setup and export
- Middleware attachment (if any)

**Removes**:
- All inline utility functions (28 functions, 611 lines)
- All processing functions (7 functions, 1,241 lines)
- All validation logic
- All business logic
- All database calls
- All external service calls
- All error handling beyond basic Express error propagation
- All logging beyond controller delegation
- All configuration constants (move to environment config or service constructors)

**After refactor**:
```typescript
// Daily agents
router.post("/proofline-run", AgentsController.runProoflineAgent);

// Monthly agents
router.post("/monthly-agents-run", AgentsController.runMonthlyAgents);
router.post("/monthly-agents-run-test", AgentsController.runMonthlyAgentsTest);

// GBP optimizer
router.post("/gbp-optimizer-run", AgentsController.runGBPOptimizer);

// Ranking agent
router.post("/ranking-run", AgentsController.runRankingAgent);

// Guardian/Governance agents
router.post("/guardian-governance-agents-run", AgentsController.runGuardianGovernanceAgents);

// Retrieval endpoints
router.get("/latest/:googleAccountId", AgentsController.getLatestAgentOutputs);
router.get("/getLatestReferralEngineOutput/:googleAccountId", AgentsController.getLatestReferralEngineOutput);

// Deprecated
router.post("/process-all", AgentsController.processAllDeprecated);

// Health check
router.get("/health", AgentsController.healthCheck);
```

---

### Controller (`controllers/agents/AgentsController.ts`)
**Responsibilities**:
- Request/response orchestration
- Call validation utils
- Call appropriate service layer
- Format responses
- Handle errors at controller level
- Return appropriate HTTP status codes
- Delegate logging to agentLogger utility

**Methods**:
```typescript
// Daily agents
runProoflineAgent(req: Request, res: Response): Promise<Response>

// Monthly agents
runMonthlyAgents(req: Request, res: Response): Promise<Response>
runMonthlyAgentsTest(req: Request, res: Response): Promise<Response>

// GBP optimizer
runGBPOptimizer(req: Request, res: Response): Promise<Response>

// Ranking agent
runRankingAgent(req: Request, res: Response): Promise<Response>

// Guardian/Governance agents
runGuardianGovernanceAgents(req: Request, res: Response): Promise<Response>

// Retrieval endpoints
getLatestAgentOutputs(req: Request, res: Response): Promise<Response>
getLatestReferralEngineOutput(req: Request, res: Response): Promise<Response>

// Deprecated
processAllDeprecated(req: Request, res: Response): Promise<Response>

// Health check
healthCheck(req: Request, res: Response): Response
```

**Receives from routes/agentsV2.ts**:
- All endpoint request/response handling logic
- All error handling blocks (try/catch)
- All response formatting
- All success/failure status code logic

---

### Service: Webhook Orchestrator (`service.webhook-orchestrator.ts`)
**Responsibilities**:
- Centralize all external webhook calls
- Implement retry logic with exponential backoff
- Handle webhook timeouts (10 minutes)
- Validate webhook URLs at service initialization
- Return structured webhook responses

**Methods**:
```typescript
callProoflineAgent(payload: ProoflinePayload): Promise<ProoflineOutput>
callSummaryAgent(payload: SummaryPayload): Promise<SummaryOutput>
callOpportunityAgent(payload: OpportunityPayload): Promise<OpportunityOutput>
callReferralEngineAgent(payload: ReferralEnginePayload): Promise<ReferralEngineOutput>
callCroOptimizerAgent(payload: CroOptimizerPayload): Promise<CroOptimizerOutput>
callCopyCompanionAgent(payload: CopyCompanionPayload): Promise<CopyCompanionOutput>
callGuardianAgent(payload: GuardianPayload): Promise<GuardianOutput>
callGovernanceAgent(payload: GovernancePayload): Promise<GovernanceOutput>
callIdentifierAgent(payload: IdentifierPayload): Promise<IdentifierOutput>
```

**Receives from routes/agentsV2.ts**:
- Lines 258-283: callAgentWebhook() generic function
- Lines 62-70: All webhook URL constants
- Retry logic from processMonthlyAgents (lines 1005-1067 for CRO Optimizer)
- Retry logic from guardian-governance-agents-run (lines 3558-3592, 3613-3649)

**Logic**:
1. Validate webhook URL is configured
2. Make POST request with 10-minute timeout
3. Parse response
4. If error, retry up to 3 times with 30-second delay
5. Return structured result or throw error

---

### Service: Agent Input Builder (`service.agent-input-builder.ts`)
**Responsibilities**:
- Build payloads for all agent types
- Handle data transformation for agent inputs
- Provide consistent payload structure
- Manage optional fields (PMS, Clarity data)

**Methods**:
```typescript
buildProoflinePayload(params: ProoflineParams): ProoflinePayload
buildSummaryPayload(params: SummaryParams): SummaryPayload
buildOpportunityPayload(params: OpportunityParams): OpportunityPayload
buildReferralEnginePayload(params: ReferralEngineParams): ReferralEnginePayload
buildCroOptimizerPayload(params: CroOptimizerParams): CroOptimizerPayload
buildCopyCompanionPayload(params: CopyCompanionParams): CopyCompanionPayload
buildGuardianGovernancePayload(params: GuardianGovernanceParams): GuardianGovernancePayload
buildIdentifierPayload(params: IdentifierParams): IdentifierPayload
```

**Receives from routes/agentsV2.ts**:
- Lines 367-387: buildProoflinePayload
- Lines 392-416: buildSummaryPayload
- Lines 421-439: buildOpportunityPayload
- Lines 445-469: buildReferralEnginePayload
- Lines 475-492: buildCroOptimizerPayload
- Lines 1374-1450: buildCopyCompanionPayload
- Lines 498-518: buildGuardianGovernancePayload

---

### Service: Agent Orchestrator (`service.agent-orchestrator.ts`)
**Responsibilities**:
- Orchestrate multi-agent sequential execution
- Manage agent dependencies (e.g., Opportunity depends on Summary output)
- Handle retry logic for entire agent chains
- Validate outputs at each step
- Return consolidated results

**Methods**:
```typescript
processDailyAgent(account: Account, oauth2Client: OAuth2Client, dates: DateRange): Promise<DailyAgentResult>
processMonthlyAgents(account: Account, oauth2Client: OAuth2Client, monthRange: DateRange): Promise<MonthlyAgentResult>
processGBPOptimizerAgent(account: Account, oauth2Client: OAuth2Client, monthRange: DateRange): Promise<GBPOptimizerResult>
processClient(account: Account, referenceDate?: string): Promise<ClientProcessingResult>
```

**Receives from routes/agentsV2.ts**:
- Lines 705-812: processDailyAgent
- Lines 818-1365: processMonthlyAgents (MASSIVE 547-line function)
- Lines 1455-1549: processGBPOptimizerAgent
- Lines 1666-1939: processClient (273-line orchestration function)

**Logic**:
- **processDailyAgent**: Fetch 2 days data → call Proofline → validate → return
- **processMonthlyAgents**: Fetch month data + PMS → call Summary → call Referral Engine → call Opportunity → call CRO Optimizer (with retries) → create tasks from all 3 outputs → return
- **processGBPOptimizerAgent**: Fetch GBP posts → call Copy Companion → validate → return
- **processClient**: Orchestrate daily + monthly agents with 3-attempt retry, save to DB only after ALL validations pass

---

### Service: Agent Validator (`service.agent-validator.ts`)
**Responsibilities**:
- Validate agent outputs are not empty
- Type checking for expected output structure
- Log validation results
- Return boolean validation status

**Methods**:
```typescript
isValidAgentOutput(output: any, agentType: string): boolean
logAgentOutput(agentType: string, output: any): void
```

**Receives from routes/agentsV2.ts**:
- Lines 117-159: isValidAgentOutput
- Lines 164-171: logAgentOutput

---

### Service: Task Creator (`service.task-creator.ts`)
**Responsibilities**:
- Create tasks from agent outputs
- Handle different agent output structures (Opportunity, CRO Optimizer, Referral Engine)
- Parse action items from agent recommendations
- Determine task category (ALLORO vs USER)
- Bulk insert tasks to database via model

**Methods**:
```typescript
createTasksFromOpportunityOutput(opportunityOutput: any, googleAccountId: number, domain: string): Promise<TaskCreationResult>
createTasksFromCroOptimizerOutput(croOptimizerOutput: any, googleAccountId: number, domain: string): Promise<TaskCreationResult>
createTasksFromReferralEngineOutput(referralEngineOutput: any, googleAccountId: number, domain: string): Promise<TaskCreationResult>
createTasksFromCopyRecommendations(agentOutput: any, googleAccountId: number, domain: string): Promise<TaskCreationResult>
```

**Receives from routes/agentsV2.ts**:
- Lines 1069-1130: Opportunity task creation
- Lines 1132-1191: CRO Optimizer task creation
- Lines 1193-1347: Referral Engine task creation
- Lines 1554-1659: Copy Companion task creation

**Logic**:
1. Extract action items/opportunities from agent output
2. Parse each item (handle both string and object formats)
3. Determine task category (ALLORO vs USER)
4. Build task data with metadata
5. Insert via TaskModel.bulkInsert()
6. Return count of created tasks

---

### Service: Recommendation Parser (`service.recommendation-parser.ts`)
**Responsibilities**:
- Parse Guardian and Governance agent outputs
- Extract recommendations with nested structures
- Map recommendation fields to database schema
- Bulk insert recommendations via model
- Handle failsafe error recovery (don't fail entire run)

**Methods**:
```typescript
saveRecommendationsFromAgents(guardianResultId: number, governanceResultId: number, guardianResults: any[], governanceResults: any[]): Promise<RecommendationSaveResult>
parseGuardianRecommendations(guardianResults: any[], guardianResultId: number): RecommendationRecord[]
parseGovernanceRecommendations(governanceResults: any[], governanceResultId: number): RecommendationRecord[]
```

**Receives from routes/agentsV2.ts**:
- Lines 525-695: saveRecommendationsFromAgents (MASSIVE 170-line function with nested loops)

**Logic**:
1. Parse Guardian recommendations (handle nested structure)
2. Parse Governance recommendations (similar structure)
3. Validate required fields (title is mandatory)
4. Map to database schema
5. Bulk insert via AgentRecommendationModel.bulkInsert()
6. Log counts and warnings (failsafe: don't throw errors)

---

### Service: Governance Validator (`service.governance-validator.ts`)
**Responsibilities**:
- Orchestrate Guardian and Governance agents
- Group agent results by agent_type
- Fetch historical recommendations for context
- Run agents sequentially for each group
- Aggregate results for system-wide analysis

**Methods**:
```typescript
runGuardianGovernanceAgents(monthRange: DateRange): Promise<GuardianGovernanceResult>
groupAgentResultsByType(results: AgentResult[]): GroupedResults
fetchHistoricalRecommendations(agentType: string): Promise<HistoricalRecommendations>
```

**Receives from routes/agentsV2.ts**:
- Lines 3357-3798: guardian-governance-agents-run endpoint (entire 441-line handler)
- Lines 3434-3672: Agent grouping, historical fetching, sequential processing logic

**Logic**:
1. Fetch all successful agent results from specified month
2. Group by agent_type
3. For each group:
   - Fetch historical PASS/REJECT recommendations
   - Build payload with historical context
   - Call Guardian agent (3 retries)
   - Call Governance agent (3 retries)
   - Collect results
4. Save aggregated results to database
5. Parse and save recommendations

---

### Service: Data Aggregator (`service.data-aggregator.ts`)
**Responsibilities**:
- Aggregate Google data (GA4, GBP, GSC, Clarity)
- Aggregate PMS data
- Handle OAuth2 client retrieval
- Return consolidated data structure

**Methods**:
```typescript
aggregateMonthlyData(account: Account, oauth2Client: OAuth2Client, monthRange: DateRange): Promise<MonthlyData>
aggregateDailyData(account: Account, oauth2Client: OAuth2Client, dates: DateRange): Promise<DailyData>
aggregatePmsData(domain: string): Promise<PmsData>
```

**Receives from routes/agentsV2.ts**:
- Lines 719-749: Daily data fetching for Proofline
- Lines 851-892: Monthly data fetching for Summary
- Calls to existing `fetchAllServiceData` from `../services/dataAggregator`
- Calls to existing `aggregatePmsData` from `../utils/pmsAggregator`

**Logic**:
- Wrap existing data aggregation utilities
- Add error handling and logging
- Return consistent data structure

---

### Service: Ranking Processor (`service.ranking-processor.ts`)
**Responsibilities**:
- Process practice ranking analysis
- Call Identifier Agent for location metadata
- Create ranking records upfront
- Update ranking status with progress
- Handle retry logic for ranking analysis

**Methods**:
```typescript
processRankingRun(accounts: Account[]): Promise<RankingRunResult>
identifyLocationMeta(gbpData: any, domain: string): Promise<LocationMeta>
createRankingRecords(account: Account, locations: Location[], batchId: string): Promise<RankingRecord[]>
```

**Receives from routes/agentsV2.ts**:
- Lines 3116-3341: ranking-run endpoint (entire 225-line handler)
- Lines 288-334: identifyLocationMeta
- Lines 339-358: getFallbackMeta, getFallbackMarket

**Logic**:
1. Fetch accounts to process
2. For each account:
   - Identify location metadata (call Identifier Agent)
   - Create all ranking records upfront with "pending" status
   - Process each location sequentially with retry logic
   - Update status with progress context
3. Return results

---

### Service: Location Identifier (`service.location-identifier.ts`)
**Responsibilities**:
- Identify location specialty and market
- Call Identifier Agent webhook
- Provide fallback logic when agent fails
- Extract metadata from GBP profile

**Methods**:
```typescript
identifyLocationMeta(gbpData: any, domain: string): Promise<{ specialty: string; marketLocation: string }>
getFallbackMeta(gbpData: any): { specialty: string; marketLocation: string }
getFallbackMarket(gbpData: any): string
```

**Receives from routes/agentsV2.ts**:
- Lines 288-334: identifyLocationMeta
- Lines 339-347: getFallbackMeta
- Lines 352-358: getFallbackMarket

---

### Service: GBP Optimizer (`service.gbp-optimizer.ts`)
**Responsibilities**:
- Fetch GBP text sources (posts, profile, CTA)
- Transform to Copy Companion format
- Call Copy Companion agent
- Validate output
- Return recommendations

**Methods**:
```typescript
processGBPOptimizerAgent(account: Account, oauth2Client: OAuth2Client, monthRange: DateRange): Promise<GBPOptimizerResult>
buildCopyCompanionPayload(gbpData: any, domain: string, googleAccountId: number): CopyCompanionPayload
```

**Receives from routes/agentsV2.ts**:
- Lines 1374-1450: buildCopyCompanionPayload
- Lines 1455-1549: processGBPOptimizerAgent

---

### Utility: Agent Logger (`agentLogger.ts`)
**Responsibilities**:
- File + console logging
- Log file management (ensure directory exists)
- Error logging with stack traces
- Timestamp formatting

**Functions**:
```typescript
log(message: string): void
logError(operation: string, error: any): void
```

**Receives from routes/agentsV2.ts**:
- Lines 54-78: Configuration (LOG_DIR, LOG_FILE)
- Lines 75-78: Directory creation logic
- Lines 84-94: log() function
- Lines 96-100: logError() function

---

### Utility: Date Helpers (`dateHelpers.ts`)
**Responsibilities**:
- Date formatting and calculations
- Date range generation for daily/monthly agents
- Conditional logic for monthly agent triggers

**Functions**:
```typescript
formatDate(d: Date): string
getDailyDates(referenceDate?: string): { yesterday: string; dayBeforeYesterday: string }
getPreviousMonthRange(referenceDate?: string): { startDate: string; endDate: string }
getCurrentMonthRange(): { startDate: string; endDate: string }
shouldRunMonthlyAgents(referenceDate?: string): boolean
```

**Receives from routes/agentsV2.ts**:
- Lines 177-179: formatDate
- Lines 184-198: getDailyDates
- Lines 203-215: getPreviousMonthRange
- Lines 237-249: getCurrentMonthRange
- Lines 221-232: shouldRunMonthlyAgents

---

### Utility: Validation Utils (`validationUtils.ts`)
**Responsibilities**:
- Request body validation
- URL param validation
- Type checking
- Return structured validation results

**Functions**:
```typescript
validateProoflineRunInput(body: any): { referenceDate?: string } | ValidationError
validateMonthlyAgentsRunInput(body: any): { googleAccountId: number; domain: string; force?: boolean; pmsJobId?: number } | ValidationError
validateRankingRunInput(body: any): { googleAccountId?: number } | ValidationError
validateGuardianGovernanceInput(body: any): { month?: string; referenceDate?: string } | ValidationError
validateAccountIdParam(params: any): { googleAccountId: number } | ValidationError
```

**Receives from routes/agentsV2.ts**:
- Validation logic scattered throughout endpoint handlers
- Lines 2129-2136: Monthly agents validation
- Lines 3129-3140: Ranking run validation
- Lines 3361-3376: Guardian/Governance validation
- Lines 3920-3927: Account ID param validation

---

### Utility: Retry Utils (`retryUtils.ts`)
**Responsibilities**:
- Generic retry logic with exponential backoff
- Configurable max attempts and delay
- Error logging between retries

**Functions**:
```typescript
retryWithBackoff<T>(fn: () => Promise<T>, maxAttempts: number, delayMs: number, operation: string): Promise<T>
delay(ms: number): Promise<void>
```

**Receives from routes/agentsV2.ts**:
- Lines 105-107: delay() function
- Retry logic from processMonthlyAgents (CRO Optimizer, lines 1013-1067)
- Retry logic from guardian-governance run (lines 3558-3592, 3613-3649)
- Retry logic from processClient (lines 1684-1931)

---

### Utility: Duplicate Detector (`duplicateDetector.ts`)
**Responsibilities**:
- Check for existing agent results
- Prevent duplicate agent runs
- Query database for matching records

**Functions**:
```typescript
isDuplicateAgentResult(googleAccountId: number, domain: string, agentType: string, dateStart: string, dateEnd: string): Promise<boolean>
isDuplicateMonthlyAgentResult(googleAccountId: number, domain: string, monthRange: DateRange): Promise<boolean>
```

**Receives from routes/agentsV2.ts**:
- Lines 1725-1738: Monthly agent duplicate check
- Lines 2967-2993: GBP optimizer duplicate check
- Lines 3467-3486: Guardian/Governance duplicate check

---

### Utility: Test Simulator (`testSimulator.ts`)
**Responsibilities**:
- Simulate task creation for test mode
- NO database writes
- Return preview of tasks that would be created

**Functions**:
```typescript
simulateTaskCreation(agentOutputs: AgentOutputs): SimulatedTaskCreationResult
```

**Receives from routes/agentsV2.ts**:
- Lines 2736-2856: simulateTaskCreation function

---

## Model Replacements

### GoogleAccountModel (EXISTS)
**Current methods**:
- `findById(id: number)` - Basic find by ID
- `findByUserId(userId: number)` - Find by user ID
- `findByDomain(domainName: string)` - Find by domain
- `findOnboardedAccounts()` - Fetch onboarded accounts

**Existing methods cover all needs** - No additions required.

**Database Call Migrations**:
```typescript
// Before (4 occurrences)
await db("google_accounts").where("onboarding_completed", true).select("*")
await db("google_accounts").where({ id: googleAccountId }).first()

// After
await GoogleAccountModel.findOnboardedAccounts()
await GoogleAccountModel.findById(googleAccountId)
```

---

### AgentResultModel (EXISTS)
**Current methods**:
- `findById(id: number)` - Basic find by ID
- `findByDomainAndAgent(domain, agentType, dateStart?)` - Find specific agent result
- `findLatestByDomainAndAgent(domain, agentType)` - Latest result
- `create(data)` - Create new result
- `updateById(id, data)` - Update result

**Required additions**:
```typescript
// Check for duplicate agent results
static async findExistingResult(
  googleAccountId: number,
  domain: string,
  agentType: string,
  dateStart: string,
  dateEnd: string,
  statuses: string[] = ["success", "pending"],
  trx?: QueryContext
): Promise<IAgentResult | undefined>

// Fetch results by date range for Guardian/Governance
static async findByDateRangeAndStatuses(
  startDate: string,
  endDate: string,
  statuses: string[] = ["success"],
  excludeAgentTypes: string[] = [],
  trx?: QueryContext
): Promise<IAgentResult[]>

// Bulk create agent results (for batch operations)
static async bulkCreate(
  results: Partial<IAgentResult>[],
  trx?: QueryContext
): Promise<IAgentResult[]>
```

**Database Call Migrations**:
```typescript
// Before (15 occurrences)
await db("agent_results").where({ google_account_id, domain, agent_type, date_start, date_end }).whereIn("status", ["success", "pending"]).first()
await db("agent_results").insert({ ... }).returning("id")
await db("agent_results").whereBetween("created_at", [...]).where("status", "success").whereNotIn("agent_type", [...]).select("*")

// After
await AgentResultModel.findExistingResult(googleAccountId, domain, agentType, dateStart, dateEnd)
await AgentResultModel.create(resultData)
await AgentResultModel.findByDateRangeAndStatuses(startDate, endDate, ["success"], ["guardian", "governance_sentinel", "gbp_optimizer"])
```

---

### TaskModel (EXISTS)
**Current methods**:
- `create(data)` - Create single task
- `bulkInsert(tasks)` - Bulk insert tasks
- `findByDomainApproved(domainName)` - Find approved tasks
- `findRecentByDomain(domainName, agentType, limit)` - Recent tasks

**Required additions**:
```typescript
// Count tasks created during a specific time range
static async countByDomainAndTimeRange(
  domainName: string,
  startTime: Date,
  trx?: QueryContext
): Promise<{ total: number; user: number; alloro: number }>

// Create task and return full record (not just ID)
static async createAndReturn(
  data: Partial<ITask>,
  trx?: QueryContext
): Promise<ITask>
```

**Database Call Migrations**:
```typescript
// Before (8+ occurrences in loops)
await db("tasks").insert(taskData).returning("id")
await db("tasks").where("domain_name", domain).where("created_at", ">=", startTime).select("category")

// After
await TaskModel.createAndReturn(taskData)
await TaskModel.countByDomainAndTimeRange(domain, startTime)
```

---

### AgentRecommendationModel (EXISTS)
**Current methods**:
- `bulkInsert(recommendations)` - Bulk insert recommendations
- `findByAgentResultId(agentResultId)` - Find by result ID

**Required additions**:
```typescript
// Fetch historical recommendations for Guardian/Governance context
static async findHistoricalByAgentType(
  agentUnderTest: string,
  status: "PASS" | "REJECT",
  limit: number = 50,
  trx?: QueryContext
): Promise<IAgentRecommendation[]>
```

**Database Call Migrations**:
```typescript
// Before (2 occurrences)
await db("agent_recommendations").where("agent_under_test", agentType).where("status", "PASS").select(...).orderBy("created_at", "desc").limit(50)
await db("agent_recommendations").insert(recommendations)

// After
await AgentRecommendationModel.findHistoricalByAgentType(agentType, "PASS", 50)
await AgentRecommendationModel.bulkInsert(recommendations)
```

---

### GoogleDataStoreModel (NEW)
**Purpose**: Abstract google_data_store table operations

**Interface**:
```typescript
export interface IGoogleDataStore {
  id: number;
  google_account_id: number;
  domain: string;
  date_start: string;
  date_end: string;
  run_type: "daily" | "monthly";
  ga4_data: Record<string, unknown> | null;
  gbp_data: Record<string, unknown> | null;
  gsc_data: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}
```

**Methods**:
```typescript
static async create(data: Partial<IGoogleDataStore>, trx?: QueryContext): Promise<IGoogleDataStore>
static async findByAccountAndDateRange(googleAccountId: number, dateStart: string, dateEnd: string, trx?: QueryContext): Promise<IGoogleDataStore | undefined>
```

**Database Call Migrations**:
```typescript
// Before (6 occurrences)
await db("google_data_store").insert(rawData)

// After
await GoogleDataStoreModel.create(rawData)
```

---

### PracticeRankingModel (EXISTS)
**Current methods**: (need to verify existing methods)

**Required additions** (if not present):
```typescript
static async create(data: Partial<IPracticeRanking>, trx?: QueryContext): Promise<IPracticeRanking>
static async updateStatus(id: number, status: string, statusDetail: Record<string, unknown>, trx?: QueryContext): Promise<number>
static async bulkCreate(rankings: Partial<IPracticeRanking>[], trx?: QueryContext): Promise<IPracticeRanking[]>
```

**Database Call Migrations**:
```typescript
// Before (4 occurrences)
await db("practice_rankings").insert({ ... }).returning("id")
await db("practice_rankings").where({ id: rankingId }).update({ status, status_detail })

// After
await PracticeRankingModel.create(rankingData)
await PracticeRankingModel.updateStatus(rankingId, status, statusDetail)
```

---

## Step-by-Step Migration

### Phase 1: Preparation (No Code Changes)
1. **Read and understand entire agentsV2.ts file** (4,161 lines)
2. **Map all database calls** to existing models
3. **Identify missing model methods** (list above)
4. **Create detailed file structure** with estimated LOC per file

### Phase 2: Create Utility Files (Low Risk)
1. **Create `agentLogger.ts`**
   - Move log(), logError(), LOG_DIR, LOG_FILE
   - Test logging functionality
2. **Create `dateHelpers.ts`**
   - Move date functions (formatDate, getDailyDates, etc.)
   - Unit test all date calculations
3. **Create `validationUtils.ts`**
   - Extract validation logic from endpoints
   - Unit test validation functions
4. **Create `retryUtils.ts`**
   - Extract retry logic
   - Unit test retry behavior
5. **Create `duplicateDetector.ts`**
   - Extract duplicate detection logic
   - Unit test duplicate detection
6. **Create `testSimulator.ts`**
   - Move simulateTaskCreation
   - Unit test simulation

### Phase 3: Enhance Models (Medium Risk)
1. **Enhance `AgentResultModel.ts`**
   - Add findExistingResult()
   - Add findByDateRangeAndStatuses()
   - Add bulkCreate()
   - Unit test new methods
2. **Enhance `TaskModel.ts`**
   - Add countByDomainAndTimeRange()
   - Add createAndReturn()
   - Unit test new methods
3. **Enhance `AgentRecommendationModel.ts`**
   - Add findHistoricalByAgentType()
   - Unit test new method
4. **Create `GoogleDataStoreModel.ts`**
   - Implement create(), findByAccountAndDateRange()
   - Unit test model
5. **Enhance `PracticeRankingModel.ts`** (if needed)
   - Add missing methods
   - Unit test new methods

### Phase 4: Create Service Files (High Risk)
**Order: Start with simplest services first**

1. **Create `service.webhook-orchestrator.ts`**
   - Move callAgentWebhook() and all webhook constants
   - Implement retry logic
   - Unit test webhook calls (mock axios)

2. **Create `service.agent-input-builder.ts`**
   - Move all buildXPayload() functions
   - Unit test payload builders

3. **Create `service.agent-validator.ts`**
   - Move isValidAgentOutput(), logAgentOutput()
   - Unit test validation logic

4. **Create `service.location-identifier.ts`**
   - Move identifyLocationMeta(), getFallbackMeta(), getFallbackMarket()
   - Unit test identifier logic

5. **Create `service.data-aggregator.ts`**
   - Wrap existing data aggregation utilities
   - Unit test data aggregation

6. **Create `service.task-creator.ts`**
   - Move task creation logic from processMonthlyAgents
   - Unit test task creation (mock TaskModel)

7. **Create `service.recommendation-parser.ts`**
   - Move saveRecommendationsFromAgents()
   - Unit test recommendation parsing

8. **Create `service.gbp-optimizer.ts`**
   - Move GBP optimizer logic
   - Unit test GBP optimization

9. **Create `service.ranking-processor.ts`**
   - Move ranking agent logic
   - Unit test ranking processing

10. **Create `service.governance-validator.ts`**
    - Move Guardian/Governance orchestration logic
    - Unit test governance validation

11. **Create `service.agent-orchestrator.ts`** (MOST COMPLEX)
    - Move processDailyAgent(), processMonthlyAgents(), processGBPOptimizerAgent(), processClient()
    - Unit test orchestration logic (mock all dependencies)

### Phase 5: Create Controller (High Risk)
1. **Create `AgentsController.ts`**
   - Implement all 11 controller methods
   - Wire up service layer calls
   - Handle errors and format responses
   - Unit test controller methods (mock services)

### Phase 6: Update Routes File (High Risk)
1. **Update `routes/agentsV2.ts`**
   - Remove all inline functions
   - Remove all business logic
   - Keep only route definitions
   - Wire up controller methods
   - Test all endpoints

### Phase 7: Integration Testing (CRITICAL)
1. **Test Proofline Run Endpoint**
   - Test with single account
   - Test with multiple accounts
   - Test retry logic
   - Test duplicate detection
2. **Test Monthly Agents Run Endpoint**
   - Test with PMS data
   - Test without PMS data
   - Test task creation
   - Test automation status updates
3. **Test Monthly Agents Run Test Endpoint**
   - Verify NO database writes
   - Verify NO emails sent
   - Test simulation logic
4. **Test GBP Optimizer Run Endpoint**
   - Test with GBP accounts
   - Test task creation
   - Test duplicate detection
5. **Test Ranking Run Endpoint**
   - Test with single account
   - Test with multiple locations
   - Test Identifier Agent fallback
6. **Test Guardian/Governance Run Endpoint**
   - Test with multiple agent types
   - Test recommendation parsing
   - Test historical context fetching
7. **Test Retrieval Endpoints**
   - Test latest agent outputs
   - Test referral engine output
   - Test pending automation status
8. **Test Health Check Endpoint**
   - Verify webhook configuration status

### Phase 8: Production Deployment (CRITICAL)
1. **Deploy to staging environment**
2. **Run smoke tests on all endpoints**
3. **Monitor logs for errors**
4. **Monitor agent execution times**
5. **Monitor database performance**
6. **Deploy to production with rollback plan**

---

## Risk Assessment

### HIGH RISK Areas
1. **processMonthlyAgents() - 547 lines** (Lines 818-1365)
   - **Risk**: Sequential agent execution with complex task creation logic
   - **Mitigation**: Extensive unit testing, integration testing with real webhooks
   - **Rollback**: Keep original function commented in route file

2. **processClient() - 273 lines** (Lines 1666-1939)
   - **Risk**: 3-attempt retry logic with database writes
   - **Mitigation**: Test retry behavior, test duplicate detection
   - **Rollback**: Keep original function commented in route file

3. **saveRecommendationsFromAgents() - 170 lines** (Lines 525-695)
   - **Risk**: Nested loops with failsafe error handling
   - **Mitigation**: Unit test parsing logic, test with real Guardian/Governance outputs
   - **Rollback**: Keep original function commented in route file

4. **guardian-governance-agents-run - 441 lines** (Lines 3357-3798)
   - **Risk**: System-wide analysis with grouping, historical fetching, sequential processing
   - **Mitigation**: Test with production-like data, test retry logic
   - **Rollback**: Keep original endpoint handler commented

5. **Test mode endpoint** (Lines 2448-2731)
   - **Risk**: Must guarantee NO database writes, NO emails
   - **Mitigation**: Integration tests verifying no side effects
   - **Rollback**: Keep original endpoint handler commented

### MEDIUM RISK Areas
1. **Webhook orchestration**
   - **Risk**: 10-minute timeouts, retry logic, webhook URL validation
   - **Mitigation**: Mock webhook calls in tests, test timeout behavior

2. **Task creation from agent outputs**
   - **Risk**: Different output structures per agent (Opportunity, CRO Optimizer, Referral Engine, Copy Companion)
   - **Mitigation**: Unit test each task creation flow separately

3. **Duplicate detection logic**
   - **Risk**: Race conditions in concurrent runs
   - **Mitigation**: Use database transactions where possible, add unique constraints

4. **Date range calculations**
   - **Risk**: Edge cases (month boundaries, leap years, referenceDate parameter)
   - **Mitigation**: Comprehensive unit tests for all edge cases

### LOW RISK Areas
1. **Logging functions**
   - **Risk**: File system operations
   - **Mitigation**: Ensure LOG_DIR exists, handle write errors

2. **Validation utilities**
   - **Risk**: Type checking
   - **Mitigation**: Unit test all validation functions

3. **Payload builders**
   - **Risk**: Data transformation
   - **Mitigation**: Unit test all payload builders

---

## Files to Create

### 1. `/signalsai-backend/src/controllers/agents/AgentsController.ts`
**Purpose**: Main controller entry point

**Exports**:
```typescript
runProoflineAgent(req: Request, res: Response): Promise<Response>
runMonthlyAgents(req: Request, res: Response): Promise<Response>
runMonthlyAgentsTest(req: Request, res: Response): Promise<Response>
runGBPOptimizer(req: Request, res: Response): Promise<Response>
runRankingAgent(req: Request, res: Response): Promise<Response>
runGuardianGovernanceAgents(req: Request, res: Response): Promise<Response>
getLatestAgentOutputs(req: Request, res: Response): Promise<Response>
getLatestReferralEngineOutput(req: Request, res: Response): Promise<Response>
processAllDeprecated(req: Request, res: Response): Promise<Response>
healthCheck(req: Request, res: Response): Response
```

**Dependencies**:
- All services in `feature-services/`
- All utilities in `feature-utils/`
- Express types

**Estimated LOC**: ~400 LOC

---

### 2. `/signalsai-backend/src/controllers/agents/feature-services/service.webhook-orchestrator.ts`
**Purpose**: Centralized webhook calls with retry logic

**Exports**:
```typescript
callProoflineAgent(payload: ProoflinePayload): Promise<ProoflineOutput>
callSummaryAgent(payload: SummaryPayload): Promise<SummaryOutput>
callOpportunityAgent(payload: OpportunityPayload): Promise<OpportunityOutput>
callReferralEngineAgent(payload: ReferralEnginePayload): Promise<ReferralEngineOutput>
callCroOptimizerAgent(payload: CroOptimizerPayload): Promise<CroOptimizerOutput>
callCopyCompanionAgent(payload: CopyCompanionPayload): Promise<CopyCompanionOutput>
callGuardianAgent(payload: GuardianPayload): Promise<GuardianOutput>
callGovernanceAgent(payload: GovernancePayload): Promise<GovernanceOutput>
callIdentifierAgent(payload: IdentifierPayload): Promise<IdentifierOutput>
```

**Dependencies**:
- axios
- agentLogger
- retryUtils
- Environment variables

**Estimated LOC**: ~200 LOC

---

### 3. `/signalsai-backend/src/controllers/agents/feature-services/service.agent-input-builder.ts`
**Purpose**: Build payloads for all agent types

**Exports**:
```typescript
buildProoflinePayload(params: ProoflineParams): ProoflinePayload
buildSummaryPayload(params: SummaryParams): SummaryPayload
buildOpportunityPayload(params: OpportunityParams): OpportunityPayload
buildReferralEnginePayload(params: ReferralEngineParams): ReferralEnginePayload
buildCroOptimizerPayload(params: CroOptimizerParams): CroOptimizerPayload
buildCopyCompanionPayload(params: CopyCompanionParams): CopyCompanionPayload
buildGuardianGovernancePayload(params: GuardianGovernanceParams): GuardianGovernancePayload
buildIdentifierPayload(params: IdentifierParams): IdentifierPayload
```

**Dependencies**: None (pure functions)

**Estimated LOC**: ~350 LOC

---

### 4. `/signalsai-backend/src/controllers/agents/feature-services/service.agent-orchestrator.ts`
**Purpose**: Multi-agent sequential execution orchestration

**Exports**:
```typescript
processDailyAgent(account: Account, oauth2Client: OAuth2Client, dates: DateRange): Promise<DailyAgentResult>
processMonthlyAgents(account: Account, oauth2Client: OAuth2Client, monthRange: DateRange): Promise<MonthlyAgentResult>
processGBPOptimizerAgent(account: Account, oauth2Client: OAuth2Client, monthRange: DateRange): Promise<GBPOptimizerResult>
processClient(account: Account, referenceDate?: string): Promise<ClientProcessingResult>
```

**Dependencies**:
- service.webhook-orchestrator
- service.agent-input-builder
- service.agent-validator
- service.data-aggregator
- service.task-creator
- Models (AgentResultModel, GoogleDataStoreModel)
- agentLogger
- duplicateDetector
- retryUtils

**Estimated LOC**: ~500 LOC

---

### 5. `/signalsai-backend/src/controllers/agents/feature-services/service.agent-validator.ts`
**Purpose**: Validate agent outputs

**Exports**:
```typescript
isValidAgentOutput(output: any, agentType: string): boolean
logAgentOutput(agentType: string, output: any): void
```

**Dependencies**:
- agentLogger

**Estimated LOC**: ~100 LOC

---

### 6. `/signalsai-backend/src/controllers/agents/feature-services/service.task-creator.ts`
**Purpose**: Create tasks from agent outputs

**Exports**:
```typescript
createTasksFromOpportunityOutput(opportunityOutput: any, googleAccountId: number, domain: string): Promise<TaskCreationResult>
createTasksFromCroOptimizerOutput(croOptimizerOutput: any, googleAccountId: number, domain: string): Promise<TaskCreationResult>
createTasksFromReferralEngineOutput(referralEngineOutput: any, googleAccountId: number, domain: string): Promise<TaskCreationResult>
createTasksFromCopyRecommendations(agentOutput: any, googleAccountId: number, domain: string): Promise<TaskCreationResult>
```

**Dependencies**:
- TaskModel
- agentLogger

**Estimated LOC**: ~400 LOC

---

### 7. `/signalsai-backend/src/controllers/agents/feature-services/service.recommendation-parser.ts`
**Purpose**: Parse and save recommendations from Guardian/Governance agents

**Exports**:
```typescript
saveRecommendationsFromAgents(guardianResultId: number, governanceResultId: number, guardianResults: any[], governanceResults: any[]): Promise<RecommendationSaveResult>
parseGuardianRecommendations(guardianResults: any[], guardianResultId: number): RecommendationRecord[]
parseGovernanceRecommendations(governanceResults: any[], governanceResultId: number): RecommendationRecord[]
```

**Dependencies**:
- AgentRecommendationModel
- agentLogger

**Estimated LOC**: ~250 LOC

---

### 8. `/signalsai-backend/src/controllers/agents/feature-services/service.governance-validator.ts`
**Purpose**: Orchestrate Guardian and Governance agents

**Exports**:
```typescript
runGuardianGovernanceAgents(monthRange: DateRange): Promise<GuardianGovernanceResult>
groupAgentResultsByType(results: AgentResult[]): GroupedResults
fetchHistoricalRecommendations(agentType: string): Promise<HistoricalRecommendations>
```

**Dependencies**:
- AgentResultModel
- AgentRecommendationModel
- service.webhook-orchestrator
- service.agent-input-builder
- service.recommendation-parser
- agentLogger
- retryUtils

**Estimated LOC**: ~300 LOC

---

### 9. `/signalsai-backend/src/controllers/agents/feature-services/service.data-aggregator.ts`
**Purpose**: Aggregate Google data and PMS data

**Exports**:
```typescript
aggregateMonthlyData(account: Account, oauth2Client: OAuth2Client, monthRange: DateRange): Promise<MonthlyData>
aggregateDailyData(account: Account, oauth2Client: OAuth2Client, dates: DateRange): Promise<DailyData>
aggregatePmsData(domain: string): Promise<PmsData>
```

**Dependencies**:
- ../services/dataAggregator (existing)
- ../utils/pmsAggregator (existing)
- agentLogger

**Estimated LOC**: ~200 LOC

---

### 10. `/signalsai-backend/src/controllers/agents/feature-services/service.ranking-processor.ts`
**Purpose**: Process practice ranking analysis

**Exports**:
```typescript
processRankingRun(accounts: Account[]): Promise<RankingRunResult>
identifyLocationMeta(gbpData: any, domain: string): Promise<LocationMeta>
createRankingRecords(account: Account, locations: Location[], batchId: string): Promise<RankingRecord[]>
```

**Dependencies**:
- PracticeRankingModel
- service.location-identifier
- ../services/rankingService (existing processLocationRanking)
- agentLogger
- retryUtils

**Estimated LOC**: ~300 LOC

---

### 11. `/signalsai-backend/src/controllers/agents/feature-services/service.location-identifier.ts`
**Purpose**: Identify location specialty and market

**Exports**:
```typescript
identifyLocationMeta(gbpData: any, domain: string): Promise<{ specialty: string; marketLocation: string }>
getFallbackMeta(gbpData: any): { specialty: string; marketLocation: string }
getFallbackMarket(gbpData: any): string
```

**Dependencies**:
- service.webhook-orchestrator
- agentLogger

**Estimated LOC**: ~150 LOC

---

### 12. `/signalsai-backend/src/controllers/agents/feature-services/service.gbp-optimizer.ts`
**Purpose**: GBP copy optimization

**Exports**:
```typescript
processGBPOptimizerAgent(account: Account, oauth2Client: OAuth2Client, monthRange: DateRange): Promise<GBPOptimizerResult>
buildCopyCompanionPayload(gbpData: any, domain: string, googleAccountId: number): CopyCompanionPayload
```

**Dependencies**:
- service.webhook-orchestrator
- ../routes/gbp (existing getGBPTextSources)
- agentLogger

**Estimated LOC**: ~250 LOC

---

### 13. `/signalsai-backend/src/controllers/agents/feature-utils/agentLogger.ts`
**Purpose**: File + console logging

**Exports**:
```typescript
log(message: string): void
logError(operation: string, error: any): void
```

**Dependencies**:
- fs, path

**Estimated LOC**: ~80 LOC

---

### 14. `/signalsai-backend/src/controllers/agents/feature-utils/dateHelpers.ts`
**Purpose**: Date formatting and calculations

**Exports**:
```typescript
formatDate(d: Date): string
getDailyDates(referenceDate?: string): { yesterday: string; dayBeforeYesterday: string }
getPreviousMonthRange(referenceDate?: string): { startDate: string; endDate: string }
getCurrentMonthRange(): { startDate: string; endDate: string }
shouldRunMonthlyAgents(referenceDate?: string): boolean
```

**Dependencies**: None (pure functions)

**Estimated LOC**: ~100 LOC

---

### 15. `/signalsai-backend/src/controllers/agents/feature-utils/validationUtils.ts`
**Purpose**: Request validation

**Exports**:
```typescript
validateProoflineRunInput(body: any): { referenceDate?: string } | ValidationError
validateMonthlyAgentsRunInput(body: any): { googleAccountId: number; domain: string; force?: boolean; pmsJobId?: number } | ValidationError
validateRankingRunInput(body: any): { googleAccountId?: number } | ValidationError
validateGuardianGovernanceInput(body: any): { month?: string; referenceDate?: string } | ValidationError
validateAccountIdParam(params: any): { googleAccountId: number } | ValidationError
```

**Dependencies**: None

**Estimated LOC**: ~150 LOC

---

### 16. `/signalsai-backend/src/controllers/agents/feature-utils/retryUtils.ts`
**Purpose**: Generic retry logic with exponential backoff

**Exports**:
```typescript
retryWithBackoff<T>(fn: () => Promise<T>, maxAttempts: number, delayMs: number, operation: string): Promise<T>
delay(ms: number): Promise<void>
```

**Dependencies**:
- agentLogger

**Estimated LOC**: ~80 LOC

---

### 17. `/signalsai-backend/src/controllers/agents/feature-utils/duplicateDetector.ts`
**Purpose**: Duplicate detection logic

**Exports**:
```typescript
isDuplicateAgentResult(googleAccountId: number, domain: string, agentType: string, dateStart: string, dateEnd: string): Promise<boolean>
isDuplicateMonthlyAgentResult(googleAccountId: number, domain: string, monthRange: DateRange): Promise<boolean>
```

**Dependencies**:
- AgentResultModel
- agentLogger

**Estimated LOC**: ~100 LOC

---

### 18. `/signalsai-backend/src/controllers/agents/feature-utils/testSimulator.ts`
**Purpose**: Test mode simulation (NO database writes)

**Exports**:
```typescript
simulateTaskCreation(agentOutputs: AgentOutputs): SimulatedTaskCreationResult
```

**Dependencies**:
- agentLogger

**Estimated LOC**: ~150 LOC

---

### 19. `/signalsai-backend/src/models/GoogleDataStoreModel.ts` (NEW)
**Purpose**: Abstract google_data_store table operations

**Exports**:
```typescript
export interface IGoogleDataStore { ... }
export class GoogleDataStoreModel extends BaseModel { ... }
```

**Estimated LOC**: ~90 LOC

---

## Files to Modify

### 1. `/signalsai-backend/src/routes/agentsV2.ts`
**Changes**:
- Remove all inline functions (28 functions, 611 lines)
- Remove all processing functions (7 functions, 1,241 lines)
- Remove all configuration constants (move to service constructors)
- Keep only route definitions (15 routes)
- Wire up controller methods

**Before**: 4,161 LOC
**After**: ~200 LOC (95% reduction)

---

### 2. `/signalsai-backend/src/models/AgentResultModel.ts`
**Changes**:
- Add findExistingResult()
- Add findByDateRangeAndStatuses()
- Add bulkCreate()

**Before**: ~133 LOC
**After**: ~180 LOC

---

### 3. `/signalsai-backend/src/models/TaskModel.ts`
**Changes**:
- Add countByDomainAndTimeRange()
- Add createAndReturn()

**Before**: ~195 LOC
**After**: ~230 LOC

---

### 4. `/signalsai-backend/src/models/AgentRecommendationModel.ts`
**Changes**:
- Add findHistoricalByAgentType()

**Before**: ~170 LOC
**After**: ~190 LOC

---

### 5. `/signalsai-backend/src/models/PracticeRankingModel.ts` (if needed)
**Changes**:
- Add create(), updateStatus(), bulkCreate() (if not present)

**Before**: ~??? LOC
**After**: ~+50 LOC

---

## Definition of Done

### Code Quality
- [ ] All services have unit tests (>80% coverage)
- [ ] All utilities have unit tests (>90% coverage)
- [ ] All model methods have unit tests (>90% coverage)
- [ ] Controller has integration tests for all endpoints
- [ ] No direct database calls in routes or controller
- [ ] All functions have TypeScript types
- [ ] All functions have JSDoc comments
- [ ] No hardcoded values (use environment variables or constants)
- [ ] Error handling in all service methods
- [ ] Logging in all service methods

### Functionality
- [ ] All 15 endpoints work as before
- [ ] Test mode endpoint guarantees NO database writes
- [ ] Test mode endpoint guarantees NO emails sent
- [ ] Duplicate detection works correctly
- [ ] Retry logic works correctly
- [ ] Sequential agent execution works correctly
- [ ] Task creation from all agent types works correctly
- [ ] Recommendation parsing works correctly
- [ ] Guardian/Governance orchestration works correctly
- [ ] Ranking agent orchestration works correctly

### Performance
- [ ] No performance degradation compared to original
- [ ] File logging does not block agent execution
- [ ] Database queries are optimized (use indexes)
- [ ] Webhook timeouts are respected (10 minutes)

### Documentation
- [ ] README for controllers/agents/ directory
- [ ] API documentation for all controller methods
- [ ] Service layer documentation
- [ ] Migration guide for future developers

### Deployment
- [ ] Staging environment tested
- [ ] Production rollback plan documented
- [ ] Monitoring/alerting configured
- [ ] Smoke tests pass in production
