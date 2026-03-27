# Model Layer Documentation & Migration Plan

## Overview

**Created:** 2026-02-18
**Status:** Model layer implemented. Route migration pending.
**Location:** `signalsai-backend/src/models/`

The model layer centralizes all database access behind typed static classes. It replaces 829+ inline `db("table_name")` Knex calls scattered across 34 route files with reusable, typed, JSON-aware model methods.

### What Was Built

| Metric | Count |
|--------|-------|
| Total model files | 27 |
| Main schema models | 16 |
| Website builder models | 9 |
| BaseModel (foundation) | 1 |
| Barrel export (index.ts) | 1 |
| TypeScript interfaces | 25 |
| Total static methods | ~120 |
| JSON auto-serialized fields | 18 |
| Tables covered | 25 |

### Architecture Decisions

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Model style | Class with static methods | `TaskModel.findById()` is more discoverable than `findTaskById()` |
| Typing | Interfaces colocated per model | `ITask` lives in `TaskModel.ts`, close to the queries that use it |
| JSON handling | Auto-serialize/deserialize | Models parse JSON on read, stringify on write — eliminates 50+ scattered `JSON.parse` calls |
| Transactions | Optional `trx?` parameter | All methods work inside or outside `db.transaction()` blocks |
| File structure | Flat + `website-builder/` subdirectory | Website builder tables live in a separate PostgreSQL schema |

---

## File Structure

```
src/models/
├── BaseModel.ts                        # Abstract base class
├── index.ts                            # Barrel re-export
│
├── UserModel.ts                        # users
├── GoogleAccountModel.ts               # google_accounts
├── OrganizationModel.ts                # organizations
├── OrganizationUserModel.ts            # organization_users
├── InvitationModel.ts                  # invitations
├── OtpCodeModel.ts                     # otp_codes
├── NotificationModel.ts               # notifications
├── TaskModel.ts                        # tasks
├── AgentResultModel.ts                 # agent_results
├── AgentRecommendationModel.ts         # agent_recommendations
├── PracticeRankingModel.ts             # practice_rankings
├── PmsJobModel.ts                      # pms_jobs
├── AuditProcessModel.ts               # audit_processes
├── ClarityDataModel.ts                 # clarity_data_store
├── KnowledgebaseEmbeddingModel.ts      # knowledgebase_embeddings
├── GooglePropertyModel.ts              # google_properties
│
└── website-builder/
    ├── ProjectModel.ts                 # website_builder.projects
    ├── PageModel.ts                    # website_builder.pages
    ├── TemplateModel.ts                # website_builder.templates
    ├── TemplatePageModel.ts            # website_builder.template_pages
    ├── HeaderFooterCodeModel.ts        # website_builder.header_footer_code
    ├── MediaModel.ts                   # website_builder.media
    ├── AlloroImportModel.ts            # website_builder.alloro_imports
    ├── AdminSettingModel.ts            # website_builder.admin_settings
    └── UserEditModel.ts               # website_builder.user_edits
```

---

## BaseModel Reference

**File:** `src/models/BaseModel.ts`
**Purpose:** Abstract foundation all models inherit from. Provides shared CRUD, pagination, timestamp management, and JSON serialization.

### Exported Types

| Type | Definition | Used By |
|------|-----------|---------|
| `QueryContext` | `Knex \| Knex.Transaction` | Every model method that accepts `trx?` |
| `PaginationParams` | `{ limit?: number; offset?: number }` | `paginate()`, `listAdmin()` methods |
| `PaginatedResult<T>` | `{ data: T[]; total: number }` | Return type of paginated queries |

### Shared Methods

| Method | Signature | Behavior |
|--------|-----------|----------|
| `table(trx?)` | `protected static` | Returns `(trx \|\| db)(this.tableName)` — transaction-aware query builder |
| `findById(id, trx?)` | `→ Promise<any>` | `.where({ id }).first()` + JSON deserialization |
| `findOne(conditions, trx?)` | `→ Promise<any>` | `.where(conditions).first()` + JSON deserialization |
| `findMany(conditions, trx?)` | `→ Promise<any[]>` | `.where(conditions)` + JSON deserialization |
| `create(data, trx?)` | `→ Promise<any>` | `.insert(data + timestamps).returning("*")` + JSON serialization |
| `createReturningId(data, trx?)` | `→ Promise<number>` | `.insert(data + timestamps).returning("id")` |
| `updateById(id, data, trx?)` | `→ Promise<number>` | `.where({ id }).update(data + updated_at)` + JSON serialization |
| `deleteById(id, trx?)` | `→ Promise<number>` | `.where({ id }).del()` |
| `count(conditions?, trx?)` | `→ Promise<number>` | `.count("* as count")` |
| `paginate(buildQuery, params, trx?)` | `→ Promise<PaginatedResult<T>>` | Clone for count + limit/offset for data |

### JSON Handling

Each model declares `protected static jsonFields: string[]`. BaseModel uses this to:
- **On write** (`serializeJsonFields`): `JSON.stringify()` any field listed in `jsonFields`
- **On read** (`deserializeJsonFields`): `JSON.parse()` any field listed in `jsonFields`

### Timestamp Convention

- `create()` automatically adds `created_at: new Date()` and `updated_at: new Date()`
- `updateById()` automatically adds `updated_at: new Date()`
- Subclasses that override these methods or call `this.table()` directly must manage timestamps themselves

---

## Model Catalog

### 1. UserModel

**File:** `src/models/UserModel.ts`
**Table:** `users`
**JSON Fields:** none
**Used by routes:** auth.ts, auth-otp.ts, settings.ts, admin/auth.ts

#### Interface: IUser
```typescript
{
  id: number
  email: string
  name: string | null
  password_hash: string | null
  created_at: Date
  updated_at: Date
}
```

#### Methods
| Method | Signature | Source Pattern |
|--------|-----------|---------------|
| `findById(id, trx?)` | `→ IUser \| undefined` | admin/auth.ts, settings.ts |
| `findByEmail(email, trx?)` | `→ IUser \| undefined` | auth.ts, auth-otp.ts. Auto-lowercases email. |
| `create({ email, name }, trx?)` | `→ IUser` | auth.ts, auth-otp.ts. Auto-lowercases email, defaults name from email prefix. |
| `findOrCreate(email, name?, trx?)` | `→ IUser` | Deduplicates pattern from auth.ts:258-291, auth-otp.ts:159-191 |

---

### 2. GoogleAccountModel

**File:** `src/models/GoogleAccountModel.ts`
**Table:** `google_accounts`
**JSON Fields:** `google_property_ids`, `setup_progress`
**Used by routes:** 12+ files — most referenced table in the system

#### Interface: IGoogleAccount
```typescript
{
  id: number
  user_id: number
  google_user_id: string
  email: string
  refresh_token: string
  access_token: string | null
  token_type: string | null
  expiry_date: Date | null
  scopes: string | null
  domain_name: string | null
  practice_name: string | null
  phone: string | null
  operational_jurisdiction: string | null
  first_name: string | null
  last_name: string | null
  organization_id: number | null
  onboarding_completed: boolean
  onboarding_wizard_completed: boolean
  google_property_ids: Record<string, unknown> | null   // auto-parsed JSON
  setup_progress: Record<string, unknown> | null         // auto-parsed JSON
  created_at: Date
  updated_at: Date
}
```

#### Methods
| Method | Signature | Source Pattern |
|--------|-----------|---------------|
| `findById(id, trx?)` | `→ IGoogleAccount \| undefined` | notifications.ts, profile.ts, settings.ts, tasks.ts, onboarding.ts |
| `findByUserId(userId, trx?)` | `→ IGoogleAccount \| undefined` | admin/auth.ts |
| `findByGoogleUserId(googleUserId, userId, trx?)` | `→ IGoogleAccount \| undefined` | auth.ts |
| `findByDomain(domainName, trx?)` | `→ IGoogleAccount \| undefined` | pms.ts, practiceRanking.ts |
| `findOnboardedAccounts(trx?)` | `→ IGoogleAccount[]` | agentsV2.ts. Returns id, domain_name, practice_name, google_property_ids only. |
| `getDomainFromAccountId(accountId, trx?)` | `→ string \| null` | **Deduplicates** identical helper from tasks.ts and notifications.ts |
| `create(data, trx?)` | `→ IGoogleAccount` | auth.ts |
| `updateById(id, data, trx?)` | `→ number` | profile.ts, onboarding.ts, settings.ts |
| `updateTokens(id, tokens, trx?)` | `→ number` | auth.ts token refresh. Accepts access_token, refresh_token?, token_type?, expiry_date?, scopes? |

---

### 3. OrganizationModel

**File:** `src/models/OrganizationModel.ts`
**Table:** `organizations`
**JSON Fields:** none
**Used by routes:** auth.ts, onboarding.ts, settings.ts, admin/organizations.ts, user/website.ts

#### Interface: IOrganization
```typescript
{
  id: number
  name: string
  domain: string | null
  subscription_tier: "DWY" | "DFY" | null
  subscription_updated_at: Date | null
  created_at: Date
  updated_at: Date
}
```

#### Methods
| Method | Signature | Source Pattern |
|--------|-----------|---------------|
| `findById(id, trx?)` | `→ IOrganization \| undefined` | settings.ts, user/website.ts |
| `findByDomain(domain, trx?)` | `→ IOrganization \| undefined` | onboarding.ts |
| `create({ name, domain? }, trx?)` | `→ IOrganization` | onboarding.ts (inside transaction) |
| `updateById(id, data, trx?)` | `→ number` | admin/organizations.ts |
| `updateTier(id, tier, trx?)` | `→ number` | Sets subscription_tier + subscription_updated_at |
| `listAll(trx?)` | `→ IOrganization[]` | admin/organizations.ts. Sorted by name asc. |

---

### 4. OrganizationUserModel

**File:** `src/models/OrganizationUserModel.ts`
**Table:** `organization_users`
**JSON Fields:** none
**Used by routes:** auth.ts, auth-otp.ts, settings.ts, admin/organizations.ts, middleware/rbac.ts

#### Interfaces
```typescript
IOrganizationUser {
  user_id: number
  organization_id: number
  role: "admin" | "manager" | "viewer"
  created_at: Date
  updated_at: Date
}

IOrganizationUserWithUser extends IOrganizationUser {
  name: string    // from JOIN with users
  email: string   // from JOIN with users
}
```

#### Methods
| Method | Signature | Source Pattern |
|--------|-----------|---------------|
| `findByUserAndOrg(userId, orgId, trx?)` | `→ IOrganizationUser \| undefined` | auth.ts, settings.ts |
| `findByUserId(userId, trx?)` | `→ IOrganizationUser \| undefined` | middleware/rbac.ts |
| `create({ user_id, organization_id, role }, trx?)` | `→ IOrganizationUser` | auth.ts, auth-otp.ts, onboarding.ts |
| `updateRole(userId, orgId, role, trx?)` | `→ number` | settings.ts |
| `deleteByUserAndOrg(userId, orgId, trx?)` | `→ number` | settings.ts |
| `listByOrgWithUsers(orgId, trx?)` | `→ IOrganizationUserWithUser[]` | settings.ts. JOIN with users table. |
| `countByOrg(orgId, trx?)` | `→ number` | admin/organizations.ts |

---

### 5. InvitationModel

**File:** `src/models/InvitationModel.ts`
**Table:** `invitations`
**JSON Fields:** none
**Used by routes:** auth-otp.ts, settings.ts

#### Interface: IInvitation
```typescript
{
  id: number
  email: string
  organization_id: number
  role: string
  token: string
  expires_at: Date
  status: "pending" | "accepted" | "expired"
  created_at: Date
  updated_at: Date
}
```

#### Methods
| Method | Signature | Source Pattern |
|--------|-----------|---------------|
| `findByToken(token, trx?)` | `→ IInvitation \| undefined` | auth-otp.ts |
| `findPendingByEmail(email, trx?)` | `→ IInvitation \| undefined` | auth-otp.ts. Auto-lowercases email. |
| `findPendingByOrg(orgId, trx?)` | `→ IInvitation[]` | settings.ts |
| `create(data, trx?)` | `→ IInvitation` | settings.ts |
| `updateStatus(id, status, trx?)` | `→ number` | auth-otp.ts |

---

### 6. OtpCodeModel

**File:** `src/models/OtpCodeModel.ts`
**Table:** `otp_codes`
**JSON Fields:** none
**Used by routes:** auth-otp.ts

#### Interface: IOtpCode
```typescript
{
  id: number
  email: string
  code: string
  used: boolean
  expires_at: Date
  created_at: Date
  updated_at: Date
}
```

#### Methods
| Method | Signature | Source Pattern |
|--------|-----------|---------------|
| `create({ email, code, expires_at }, trx?)` | `→ IOtpCode` | auth-otp.ts. Auto-lowercases email. |
| `findValidCode(email, code, trx?)` | `→ IOtpCode \| undefined` | auth-otp.ts. Filters: used=false, not expired, ordered by created_at desc. |
| `markUsed(id, trx?)` | `→ number` | auth-otp.ts |

---

### 7. NotificationModel

**File:** `src/models/NotificationModel.ts`
**Table:** `notifications`
**JSON Fields:** `metadata`
**Used by routes:** notifications.ts, utils/notificationHelper.ts
**Aligns with:** `Notification` interface in `src/types/global.ts`

#### Interface: INotification
```typescript
{
  id: number
  google_account_id: number | null
  domain_name: string
  title: string
  message: string | null
  type: "task" | "pms" | "agent" | "system" | "ranking"
  priority: string | null
  read: boolean
  read_timestamp: Date | null
  metadata: Record<string, unknown> | null   // auto-parsed JSON
  created_at: Date
  updated_at: Date
}
```

#### Methods
| Method | Signature | Source Pattern |
|--------|-----------|---------------|
| `findById(id, trx?)` | `→ INotification \| undefined` | notifications.ts |
| `findByIdAndDomain(id, domainName, trx?)` | `→ INotification \| undefined` | notifications.ts (ownership validation) |
| `findByDomain(domainName, limit=10, trx?)` | `→ INotification[]` | notifications.ts. Ordered by created_at desc. |
| `countUnread(domainName, trx?)` | `→ number` | notifications.ts |
| `create(data, trx?)` | `→ number` | notifications.ts, notificationHelper.ts. Returns id. Auto-sets read=false. |
| `markRead(id, trx?)` | `→ number` | notifications.ts. Sets read=true + read_timestamp. |
| `markAllRead(domainName, trx?)` | `→ number` | notifications.ts. Updates all unread for domain. |
| `deleteById(id, trx?)` | `→ number` | notifications.ts |
| `deleteAllByDomain(domainName, trx?)` | `→ number` | notifications.ts |

---

### 8. TaskModel

**File:** `src/models/TaskModel.ts`
**Table:** `tasks`
**JSON Fields:** `metadata`
**Used by routes:** tasks.ts, agentsV2.ts, practiceRanking.ts
**Aligns with:** `ActionItem` interface in `src/types/global.ts`

#### Interface: ITask
```typescript
{
  id: number
  domain_name: string
  google_account_id: number | null
  title: string
  description: string | null
  category: "ALLORO" | "USER"
  agent_type: string | null
  status: "pending" | "in_progress" | "complete" | "archived"
  is_approved: boolean
  created_by_admin: boolean
  due_date: Date | null
  completed_at: Date | null
  metadata: Record<string, unknown> | null   // auto-parsed JSON
  created_at: Date
  updated_at: Date
}
```

#### Filter Interface: TaskAdminFilters
```typescript
{
  domain_name?: string
  status?: string
  category?: string
  agent_type?: string
  is_approved?: boolean
  date_from?: string
  date_to?: string
}
```

#### Methods
| Method | Signature | Source Pattern |
|--------|-----------|---------------|
| `findById(id, trx?)` | `→ ITask \| undefined` | tasks.ts |
| `findByIdAndDomain(id, domainName, trx?)` | `→ ITask \| undefined` | tasks.ts (ownership validation) |
| `findByDomainApproved(domainName, trx?)` | `→ ITask[]` | tasks.ts. Filters: is_approved=true, status != archived. |
| `findByMetadataField(field, value, trx?)` | `→ ITask[]` | practiceRanking.ts. Uses `whereRaw("metadata::jsonb->>'field' = ?")`. |
| `create(data, trx?)` | `→ ITask` | tasks.ts, agentsV2.ts |
| `updateById(id, data, trx?)` | `→ number` | tasks.ts |
| `archive(id, trx?)` | `→ number` | tasks.ts. Soft delete: sets status="archived". |
| `bulkArchive(ids, trx?)` | `→ number` | tasks.ts |
| `bulkUpdateStatus(ids, status, trx?)` | `→ number` | tasks.ts |
| `bulkUpdateApproval(ids, isApproved, trx?)` | `→ number` | tasks.ts |
| `bulkInsert(tasks, trx?)` | `→ void` | agentsV2.ts. Serializes JSON + timestamps per item. |
| `listAdmin(filters, pagination, trx?)` | `→ PaginatedResult<ITask>` | tasks.ts admin endpoint. Complex filtering + pagination. |
| `findRecentByDomain(domainName, agentType, limit, trx?)` | `→ ITask[]` | agentsV2.ts |

---

### 9. AgentResultModel

**File:** `src/models/AgentResultModel.ts`
**Table:** `agent_results`
**JSON Fields:** `data`
**Used by routes:** agentsV2.ts, admin/agentOutputs.ts

#### Interface: IAgentResult
```typescript
{
  id: number
  google_account_id: number
  domain: string
  agent_type: string
  date_start: string | null
  date_end: string | null
  data: Record<string, unknown> | null   // auto-parsed JSON (large payload)
  status: "success" | "pending" | "error" | "archived"
  error_message: string | null
  created_at: Date
  updated_at: Date
}
```

#### Filter Interface: AgentResultFilters
```typescript
{
  domain?: string
  agent_type?: string
  status?: string
  exclude_status?: string
  date_from?: string
  date_to?: string
}
```

#### Methods
| Method | Signature | Source Pattern |
|--------|-----------|---------------|
| `findById(id, trx?)` | `→ IAgentResult \| undefined` | admin/agentOutputs.ts |
| `findByDomainAndAgent(domain, agentType, dateStart?, trx?)` | `→ IAgentResult \| undefined` | agentsV2.ts |
| `findLatestByDomainAndAgent(domain, agentType, trx?)` | `→ IAgentResult \| undefined` | agentsV2.ts |
| `create(data, trx?)` | `→ IAgentResult` | agentsV2.ts |
| `updateById(id, data, trx?)` | `→ number` | admin/agentOutputs.ts |
| `archive(id, trx?)` | `→ number` | admin/agentOutputs.ts. Sets status="archived". |
| `deleteById(id, trx?)` | `→ number` | admin/agentOutputs.ts |
| `listAdmin(filters, pagination, trx?)` | `→ PaginatedResult<IAgentResult>` | admin/agentOutputs.ts |
| `listDomains(trx?)` | `→ string[]` | admin/agentOutputs.ts. Returns distinct domain values. |
| `listAgentTypes(trx?)` | `→ string[]` | admin/agentOutputs.ts. Returns distinct agent_type values. |

---

### 10. AgentRecommendationModel

**File:** `src/models/AgentRecommendationModel.ts`
**Table:** `agent_recommendations`
**JSON Fields:** `evidence_links`
**Used by routes:** agentsV2.ts, adminAgentInsights.ts

#### Interface: IAgentRecommendation
```typescript
{
  id: number
  agent_result_id: number
  source_agent_type: string
  agent_under_test: string
  title: string
  explanation: string | null
  type: string | null
  category: string | null
  urgency: string | null
  severity: string | null
  verdict: "PASS" | "FAIL"
  confidence: number | null
  status: "PASS" | "REJECT" | "PENDING"
  evidence_links: string[] | null          // auto-parsed JSON
  rule_reference: string | null
  suggested_action: string | null
  escalation_required: boolean
  observed_at: Date | null
  created_at: Date
  updated_at: Date
}
```

#### Supporting Types
```typescript
AgentSummary {
  agent_under_test: string
  total_recommendations: number
  pass_count: number
  fail_count: number
  avg_confidence: number
}

AgentDetailFilters {
  verdict?: string
  status?: string
  category?: string
  source_agent_type?: string
}
```

#### Methods
| Method | Signature | Source Pattern |
|--------|-----------|---------------|
| `bulkInsert(recommendations, trx?)` | `→ void` | agentsV2.ts. Serializes JSON + timestamps per item. |
| `findByAgentResultId(agentResultId, trx?)` | `→ IAgentRecommendation[]` | agentsV2.ts |
| `updateStatus(id, status, trx?)` | `→ number` | adminAgentInsights.ts |
| `deleteByIds(ids, trx?)` | `→ number` | adminAgentInsights.ts |
| `deleteByAgentResultId(agentResultId, trx?)` | `→ number` | agentsV2.ts |
| `getSummaryByAgent(startDate, endDate, pagination, trx?)` | `→ PaginatedResult<AgentSummary>` | adminAgentInsights.ts. Uses `db.raw()` for CASE WHEN aggregation. |
| `getDetailsByAgent(agentUnderTest, startDate, endDate, filters, pagination, trx?)` | `→ PaginatedResult<IAgentRecommendation>` | adminAgentInsights.ts |

---

### 11. PracticeRankingModel

**File:** `src/models/PracticeRankingModel.ts`
**Table:** `practice_rankings`
**JSON Fields:** `status_detail`, `llm_analysis`, `ranking_factors`, `raw_data`
**Used by routes:** practiceRanking.ts, rankingService.ts

#### Interface: IPracticeRanking
```typescript
{
  id: number
  google_account_id: number
  domain: string
  specialty: string | null
  location: string | null
  gbp_account_id: string | null
  gbp_location_id: string | null
  gbp_location_name: string | null
  batch_id: string | null
  observed_at: Date | null
  status: "pending" | "processing" | "completed" | "failed"
  status_detail: Record<string, unknown> | null     // auto-parsed JSON
  rank_keywords: string | null
  search_city: string | null
  search_state: string | null
  search_county: string | null
  search_postal_code: string | null
  llm_analysis: Record<string, unknown> | null      // auto-parsed JSON
  ranking_factors: Record<string, unknown> | null   // auto-parsed JSON
  raw_data: Record<string, unknown> | null          // auto-parsed JSON
  rank_score: number | null
  rank_position: number | null
  total_competitors: number | null
  error_message: string | null
  created_at: Date
  updated_at: Date
}
```

#### Filter Interface: RankingFilters
```typescript
{
  status?: string
  gbp_location_id?: string
  batch_id?: string
}
```

#### Methods
| Method | Signature | Source Pattern |
|--------|-----------|---------------|
| `findById(id, trx?)` | `→ IPracticeRanking \| undefined` | practiceRanking.ts |
| `findByBatchId(batchId, trx?)` | `→ IPracticeRanking[]` | practiceRanking.ts |
| `create(data, trx?)` | `→ IPracticeRanking` | practiceRanking.ts |
| `updateById(id, data, trx?)` | `→ number` | practiceRanking.ts |
| `updateStatus(id, status, statusDetail?, trx?)` | `→ number` | practiceRanking.ts |
| `deleteById(id, trx?)` | `→ number` | practiceRanking.ts |
| `deleteByBatchId(batchId, trx?)` | `→ number` | practiceRanking.ts |
| `listByAccount(googleAccountId, filters, pagination, trx?)` | `→ PaginatedResult<IPracticeRanking>` | practiceRanking.ts |
| `findLatestByAccountAndLocation(accountId, locationId, trx?)` | `→ IPracticeRanking \| undefined` | practiceRanking.ts. Filters: status=completed. |
| `findLatestBatchByAccount(accountId, trx?)` | `→ IPracticeRanking \| undefined` | practiceRanking.ts |
| `findLatestCompletedByLocations(accountId, trx?)` | `→ IPracticeRanking[]` | practiceRanking.ts |
| `findPreviousByLocation(accountId, locationId, beforeDate, trx?)` | `→ IPracticeRanking[]` | practiceRanking.ts (trend comparison) |

---

### 12. PmsJobModel

**File:** `src/models/PmsJobModel.ts`
**Table:** `pms_jobs`
**JSON Fields:** `response_log`, `raw_input_data`, `automation_status_detail`
**Used by routes:** pms.ts, utils/pmsAutomationStatus.ts

#### Interface: IPmsJob
```typescript
{
  id: number
  domain: string
  status: string
  time_elapsed: number | null
  is_approved: boolean
  is_client_approved: boolean
  response_log: Record<string, unknown> | null              // auto-parsed JSON
  raw_input_data: Record<string, unknown> | null            // auto-parsed JSON
  automation_status_detail: Record<string, unknown> | null  // auto-parsed JSON
  created_at: Date
  updated_at: Date
}
```

#### Filter Interface: PmsJobFilters
```typescript
{
  domain?: string
  status?: string
  statuses?: string[]
  is_approved?: boolean
}
```

#### Methods
| Method | Signature | Source Pattern |
|--------|-----------|---------------|
| `findById(id, trx?)` | `→ IPmsJob \| undefined` | pms.ts |
| `create(data, trx?)` | `→ IPmsJob` | pms.ts |
| `updateById(id, data, trx?)` | `→ number` | pms.ts |
| `deleteById(id, trx?)` | `→ number` | pms.ts |
| `findLatestByDomain(domain, trx?)` | `→ IPmsJob \| undefined` | pms.ts. Ordered by created_at desc. |
| `findActiveAutomation(domain, trx?)` | `→ IPmsJob \| undefined` | pms.ts. Uses `whereRaw("automation_status_detail::jsonb->>'status' IN (...)")`. |
| `listByDomain(domain, pagination, trx?)` | `→ PaginatedResult<IPmsJob>` | pms.ts |
| `listAdmin(filters, pagination, trx?)` | `→ PaginatedResult<IPmsJob>` | pms.ts admin endpoint |
| `updateApproval(id, isApproved, trx?)` | `→ number` | pms.ts |
| `updateClientApproval(id, isClientApproved, trx?)` | `→ number` | pms.ts |
| `updateAutomationStatus(id, statusDetail, trx?)` | `→ number` | pms.ts |

---

### 13. AuditProcessModel

**File:** `src/models/AuditProcessModel.ts`
**Table:** `audit_processes`
**JSON Fields:** none
**Used by routes:** audit.ts

#### Interface: IAuditProcess
```typescript
{
  id: number
  [key: string]: unknown   // dynamic fields
  created_at: Date
  updated_at: Date
}
```

#### Methods
| Method | Signature | Source Pattern |
|--------|-----------|---------------|
| `findById(id, trx?)` | `→ IAuditProcess \| undefined` | audit.ts |
| `updateById(id, data, trx?)` | `→ number` | audit.ts |

---

### 14. ClarityDataModel

**File:** `src/models/ClarityDataModel.ts`
**Table:** `clarity_data_store`
**JSON Fields:** `data`
**Used by routes:** clarity.ts

#### Interface: IClarityData
```typescript
{
  domain: string
  report_date: string
  data: Record<string, unknown>   // auto-parsed JSON
  created_at: Date
}
```

#### Methods
| Method | Signature | Source Pattern |
|--------|-----------|---------------|
| `upsert(domain, reportDate, data, trx?)` | `→ void` | clarity.ts. Uses `INSERT ... ON CONFLICT(domain, report_date) ... MERGE`. |
| `findByDomainAndDateRange(domain, startDate, endDate, trx?)` | `→ IClarityData[]` | clarity.ts. Uses `andWhereBetween`. |

---

### 15. KnowledgebaseEmbeddingModel

**File:** `src/models/KnowledgebaseEmbeddingModel.ts`
**Table:** `knowledgebase_embeddings`
**JSON Fields:** `embedding`, `metadata`
**Used by routes:** rag.ts

#### Interface: IKnowledgebaseEmbedding
```typescript
{
  page_id: string
  database_id: string
  chunk_index: number
  text: string
  embedding: number[]                        // auto-parsed JSON array
  metadata: Record<string, unknown> | null   // auto-parsed JSON
  created_at: Date
}
```

#### Methods
| Method | Signature | Source Pattern |
|--------|-----------|---------------|
| `bulkInsert(data, trx?)` | `→ void` | rag.ts. Write-only pattern. |
| `truncate(trx?)` | `→ void` | rag.ts. Deletes all rows. |

---

### 16. GooglePropertyModel

**File:** `src/models/GooglePropertyModel.ts`
**Table:** `google_properties`
**JSON Fields:** `metadata`
**Used by routes:** auth.ts

#### Interface: IGoogleProperty
```typescript
{
  id: number
  google_account_id: number
  type: "ga4" | "gsc" | "gbp"
  external_id: string
  display_name: string | null
  metadata: Record<string, unknown> | null   // auto-parsed JSON
  selected: boolean
  created_at: Date
  updated_at: Date
}
```

#### Methods
| Method | Signature | Source Pattern |
|--------|-----------|---------------|
| `findById(id, trx?)` | `→ IGoogleProperty \| undefined` | auth.ts |
| `findByAccountId(googleAccountId, trx?)` | `→ IGoogleProperty[]` | auth.ts |
| `create(data, trx?)` | `→ IGoogleProperty` | auth.ts |

---

## Website Builder Models

All models in `src/models/website-builder/` operate on the `website_builder.*` PostgreSQL schema.

### 17. ProjectModel

**File:** `src/models/website-builder/ProjectModel.ts`
**Table:** `website_builder.projects`
**JSON Fields:** none

#### Interface: IProject
```typescript
{
  id: string
  organization_id: number | null
  name: string
  hostname: string | null
  custom_domain: string | null
  template_id: string | null
  status: string
  settings: Record<string, unknown> | null
  created_at: Date
  updated_at: Date
}
```

#### Methods
| Method | Signature |
|--------|-----------|
| `findById(id, trx?)` | `→ IProject \| undefined` |
| `findByOrganizationId(orgId, trx?)` | `→ IProject \| undefined` |
| `create(data, trx?)` | `→ IProject` |
| `updateById(id, data, trx?)` | `→ number` |
| `listAdmin(filters, pagination, trx?)` | `→ PaginatedResult<IProject>` |

---

### 18. PageModel

**File:** `src/models/website-builder/PageModel.ts`
**Table:** `website_builder.pages`
**JSON Fields:** `sections`

#### Interface: IPage
```typescript
{
  id: string
  project_id: string
  title: string
  path: string
  sections: Record<string, unknown>[] | null   // auto-parsed JSON
  meta_title: string | null
  meta_description: string | null
  status: string
  sort_order: number | null
  created_at: Date
  updated_at: Date
}
```

#### Methods
| Method | Signature |
|--------|-----------|
| `findById(id, trx?)` | `→ IPage \| undefined` |
| `findByProjectId(projectId, status?, trx?)` | `→ IPage[]`. Ordered by sort_order asc. |
| `create(data, trx?)` | `→ IPage` |
| `updateById(id, data, trx?)` | `→ number` |
| `deleteById(id, trx?)` | `→ number` |

---

### 19. TemplateModel

**File:** `src/models/website-builder/TemplateModel.ts`
**Table:** `website_builder.templates`
**JSON Fields:** none

#### Interface: ITemplate
```typescript
{
  id: string
  name: string
  description: string | null
  thumbnail_url: string | null
  category: string | null
  created_at: Date
  updated_at: Date
}
```

#### Methods
| Method | Signature |
|--------|-----------|
| `findAll(trx?)` | `→ ITemplate[]`. Sorted by name asc. |
| `findById(id, trx?)` | `→ ITemplate \| undefined` |

---

### 20. TemplatePageModel

**File:** `src/models/website-builder/TemplatePageModel.ts`
**Table:** `website_builder.template_pages`
**JSON Fields:** `sections`

#### Interface: ITemplatePage
```typescript
{
  id: string
  template_id: string
  title: string
  path: string
  sections: Record<string, unknown>[] | null
  meta_title: string | null
  meta_description: string | null
  sort_order: number | null
  created_at: Date
  updated_at: Date
}
```

#### Methods
| Method | Signature |
|--------|-----------|
| `findByTemplateId(templateId, trx?)` | `→ ITemplatePage[]`. Ordered by sort_order asc. |

---

### 21. HeaderFooterCodeModel

**File:** `src/models/website-builder/HeaderFooterCodeModel.ts`
**Table:** `website_builder.header_footer_code`
**JSON Fields:** none

#### Interface: IHeaderFooterCode
```typescript
{
  id: string
  project_id: string | null
  template_id: string | null
  name: string
  code: string
  location: "header" | "footer"
  is_enabled: boolean
  sort_order: number | null
  created_at: Date
  updated_at: Date
}
```

#### Methods
| Method | Signature |
|--------|-----------|
| `findByProjectId(projectId, trx?)` | `→ IHeaderFooterCode[]`. Ordered by sort_order asc. |
| `findByTemplateId(templateId, trx?)` | `→ IHeaderFooterCode[]`. Ordered by sort_order asc. |
| `create(data, trx?)` | `→ IHeaderFooterCode` |
| `updateById(id, data, trx?)` | `→ number` |
| `deleteById(id, trx?)` | `→ number` |
| `updateSortOrder(id, sortOrder, trx?)` | `→ number` |
| `toggleEnabled(id, isEnabled, trx?)` | `→ number` |

---

### 22. MediaModel

**File:** `src/models/website-builder/MediaModel.ts`
**Table:** `website_builder.media`
**JSON Fields:** none

#### Interface: IMedia
```typescript
{
  id: string
  project_id: string
  filename: string
  original_filename: string | null
  s3_key: string
  file_size: number
  mime_type: string | null
  width: number | null
  height: number | null
  alt_text: string | null
  created_at: Date
  updated_at: Date
}
```

#### Methods
| Method | Signature |
|--------|-----------|
| `findById(id, trx?)` | `→ IMedia \| undefined` |
| `findByProjectId(projectId, pagination, mimeTypeFilter?, search?, trx?)` | `→ PaginatedResult<IMedia>` |
| `create(data, trx?)` | `→ IMedia` |
| `deleteById(id, trx?)` | `→ number` |
| `getProjectStorageUsage(projectId, trx?)` | `→ number`. Returns total file_size in bytes. |

---

### 23. AlloroImportModel

**File:** `src/models/website-builder/AlloroImportModel.ts`
**Table:** `website_builder.alloro_imports`
**JSON Fields:** none

#### Interface: IAlloroImport
```typescript
{
  id: number
  filename: string
  type: string
  version: number
  status: "active" | "published" | "deprecated"
  text_content: string | null
  s3_key: string | null
  file_size: number | null
  mime_type: string | null
  created_at: Date
  updated_at: Date
}
```

#### Methods
| Method | Signature |
|--------|-----------|
| `findById(id, trx?)` | `→ IAlloroImport \| undefined` |
| `findByFilenameAndStatus(filename, status, trx?)` | `→ IAlloroImport \| undefined` |
| `findByFilename(filename, trx?)` | `→ IAlloroImport[]`. Ordered by version desc. |
| `create(data, trx?)` | `→ IAlloroImport` |
| `updateStatus(id, status, trx?)` | `→ number` |
| `updateStatusByFilename(filename, fromStatus, toStatus, trx?)` | `→ number` |
| `deleteByFilename(filename, trx?)` | `→ number` |
| `getLatestVersion(filename, trx?)` | `→ number`. Returns max version or 0. |
| `listAll(filters?, trx?)` | `→ IAlloroImport[]`. Optional type filter. Ordered by filename asc, version desc. |

---

### 24. AdminSettingModel

**File:** `src/models/website-builder/AdminSettingModel.ts`
**Table:** `website_builder.admin_settings`
**JSON Fields:** none

#### Interface: IAdminSetting
```typescript
{
  id: number
  category: string
  key: string
  value: string
  created_at: Date
  updated_at: Date
}
```

#### Methods
| Method | Signature |
|--------|-----------|
| `findAll(trx?)` | `→ IAdminSetting[]`. Selects category, key, value, updated_at. |
| `findByCategoryAndKey(category, key, trx?)` | `→ IAdminSetting \| undefined` |
| `upsert(category, key, value, trx?)` | `→ IAdminSetting`. Uses `INSERT ... ON CONFLICT(category, key) ... MERGE`. |

---

### 25. UserEditModel

**File:** `src/models/website-builder/UserEditModel.ts`
**Table:** `website_builder.user_edits`
**JSON Fields:** none

#### Interface: IUserEdit
```typescript
{
  id: number
  organization_id: number
  page_id: string | null
  edit_type: string | null
  created_at: Date
}
```

#### Methods
| Method | Signature |
|--------|-----------|
| `create(data, trx?)` | `→ IUserEdit` |
| `countTodayByOrg(orgId, trx?)` | `→ number`. Counts edits since midnight today. |

---

## JSON Field Registry

| Model | Field | DB Storage | Model Returns |
|-------|-------|-----------|---------------|
| GoogleAccountModel | `google_property_ids` | stringified JSON | `Record<string, unknown> \| null` |
| GoogleAccountModel | `setup_progress` | stringified JSON | `Record<string, unknown> \| null` |
| NotificationModel | `metadata` | stringified JSON | `Record<string, unknown> \| null` |
| TaskModel | `metadata` | stringified JSON | `Record<string, unknown> \| null` |
| AgentResultModel | `data` | stringified JSON | `Record<string, unknown> \| null` |
| AgentRecommendationModel | `evidence_links` | stringified JSON | `string[] \| null` |
| PracticeRankingModel | `status_detail` | stringified JSON | `Record<string, unknown> \| null` |
| PracticeRankingModel | `llm_analysis` | stringified JSON | `Record<string, unknown> \| null` |
| PracticeRankingModel | `ranking_factors` | stringified JSON | `Record<string, unknown> \| null` |
| PracticeRankingModel | `raw_data` | stringified JSON | `Record<string, unknown> \| null` |
| PmsJobModel | `response_log` | stringified JSON | `Record<string, unknown> \| null` |
| PmsJobModel | `raw_input_data` | stringified JSON | `Record<string, unknown> \| null` |
| PmsJobModel | `automation_status_detail` | stringified JSON | `Record<string, unknown> \| null` |
| ClarityDataModel | `data` | stringified JSON | `Record<string, unknown>` |
| KnowledgebaseEmbeddingModel | `embedding` | stringified JSON | `number[]` |
| KnowledgebaseEmbeddingModel | `metadata` | stringified JSON | `Record<string, unknown> \| null` |
| PageModel | `sections` | stringified JSON | `Record<string, unknown>[] \| null` |
| TemplatePageModel | `sections` | stringified JSON | `Record<string, unknown>[] \| null` |
| GooglePropertyModel | `metadata` | stringified JSON | `Record<string, unknown> \| null` |

---

## Route-to-Model Mapping

This table shows which route files will consume which models during migration.

| Route File | Models Used | Inline `db()` Calls to Replace |
|-----------|-------------|-------------------------------|
| auth.ts | UserModel, GoogleAccountModel, OrganizationUserModel, GooglePropertyModel | ~20 |
| auth-otp.ts | UserModel, OtpCodeModel, InvitationModel, OrganizationUserModel, GoogleAccountModel | ~15 |
| notifications.ts | NotificationModel, GoogleAccountModel | ~10 |
| tasks.ts | TaskModel, GoogleAccountModel | ~25 |
| agentsV2.ts | GoogleAccountModel, TaskModel, AgentResultModel, AgentRecommendationModel | ~50+ |
| practiceRanking.ts | PracticeRankingModel, GoogleAccountModel, TaskModel | ~34 |
| pms.ts | PmsJobModel, GoogleAccountModel | ~30 |
| settings.ts | GoogleAccountModel, UserModel, OrganizationUserModel, InvitationModel, OrganizationModel | ~15 |
| profile.ts | GoogleAccountModel | ~3 |
| onboarding.ts | GoogleAccountModel, OrganizationModel, OrganizationUserModel | ~8 |
| admin/agentOutputs.ts | AgentResultModel | ~15 |
| adminAgentInsights.ts | AgentRecommendationModel | ~8 |
| admin/organizations.ts | OrganizationModel, OrganizationUserModel, GoogleAccountModel | ~8 |
| admin/websites.ts | ProjectModel, PageModel, TemplateModel, TemplatePageModel, HeaderFooterCodeModel | ~40+ |
| admin/media.ts | MediaModel, ProjectModel | ~10 |
| admin/imports.ts | AlloroImportModel | ~10 |
| admin/settings.ts | AdminSettingModel | ~3 |
| admin/auth.ts | UserModel, GoogleAccountModel | ~2 |
| imports.ts | AlloroImportModel | ~2 |
| user/website.ts | OrganizationModel, ProjectModel, PageModel, MediaModel, UserEditModel | ~6 |
| clarity.ts | ClarityDataModel | ~4 |
| audit.ts | AuditProcessModel | ~3 |
| rag.ts | KnowledgebaseEmbeddingModel | ~2 |

**Routes with NO database calls** (no model migration needed):
- ga4.ts, gsc.ts, gbp.ts, places.ts (Google API proxy only)
- scraper.ts (file I/O only)
- support.ts, websiteContact.ts (webhook/email only)
- documentation.ts (static export)
- monday.ts (Monday.com API only)
- appLogs.ts (file system only)
- googleauth.ts (delegates to auth.ts)

---

## Migration Plan: Replacing Inline `db()` Calls

### Migration Priority (by impact)

| Priority | Route File | `db()` Calls | Models | Rationale |
|----------|-----------|-------------|--------|-----------|
| **P1** | tasks.ts | ~25 | TaskModel, GoogleAccountModel | High call count, duplicated `getDomainFromAccountId` |
| **P1** | notifications.ts | ~10 | NotificationModel, GoogleAccountModel | Duplicated `getDomainFromAccountId`, clean extraction |
| **P1** | pms.ts | ~30 | PmsJobModel, GoogleAccountModel | High call count, complex JSON handling |
| **P2** | admin/agentOutputs.ts | ~15 | AgentResultModel | Clean pagination pattern |
| **P2** | adminAgentInsights.ts | ~8 | AgentRecommendationModel | Complex aggregation queries |
| **P2** | admin/imports.ts | ~10 | AlloroImportModel | Self-contained, clean boundary |
| **P2** | admin/media.ts | ~10 | MediaModel | Self-contained, clean boundary |
| **P2** | admin/settings.ts | ~3 | AdminSettingModel | Trivial migration |
| **P3** | profile.ts | ~3 | GoogleAccountModel | Trivial migration |
| **P3** | settings.ts | ~15 | GoogleAccountModel, UserModel, OrganizationUserModel, InvitationModel, OrganizationModel | Multiple models but clean patterns |
| **P3** | onboarding.ts | ~8 | GoogleAccountModel, OrganizationModel, OrganizationUserModel | Transaction-based, must verify trx passthrough |
| **P3** | auth-otp.ts | ~15 | UserModel, OtpCodeModel, InvitationModel, OrganizationUserModel, GoogleAccountModel | Transaction-based |
| **P4** | auth.ts | ~20 | UserModel, GoogleAccountModel, OrganizationUserModel, GooglePropertyModel | Complex transactions |
| **P4** | user/website.ts | ~6 | OrganizationModel, ProjectModel, PageModel, MediaModel, UserEditModel | Multiple models |
| **P4** | admin/organizations.ts | ~8 | OrganizationModel, OrganizationUserModel, GoogleAccountModel | Cross-model queries |
| **P5** | practiceRanking.ts | ~34 | PracticeRankingModel, GoogleAccountModel, TaskModel | Highest call count, complex logic |
| **P5** | agentsV2.ts | ~50+ | GoogleAccountModel, TaskModel, AgentResultModel, AgentRecommendationModel | Largest file, most complex |
| **P5** | admin/websites.ts | ~40+ | ProjectModel, PageModel, TemplateModel, TemplatePageModel, HeaderFooterCodeModel | Largest admin file |
| **P6** | clarity.ts | ~4 | ClarityDataModel | Low priority, low usage |
| **P6** | audit.ts | ~3 | AuditProcessModel | Low priority |
| **P6** | rag.ts | ~2 | KnowledgebaseEmbeddingModel | Low priority |

### Migration Pattern (per route file)

For each route file:

1. **Add model imports** — replace `import { db } from "../database/connection"` with model imports
2. **Replace `db("table")` calls** — swap each inline query with the corresponding model method
3. **Remove duplicate helpers** — delete `getDomainFromAccountId()` and `handleError()` copies
4. **Remove JSON parse logic** — models auto-deserialize, so remove all `typeof x === "string" ? JSON.parse(x) : x` patterns
5. **Remove timestamp injection** — models auto-add `created_at`/`updated_at`, so remove manual timestamp additions
6. **Verify transaction passthrough** — ensure `trx` is passed to model methods inside `db.transaction()` blocks
7. **Test endpoint** — verify each endpoint still returns the same response

### Migration Example

**Before** (from notifications.ts):
```typescript
import { db } from "../database/connection";

async function getDomainFromAccountId(googleAccountId: number): Promise<string | null> {
  const account = await db("google_accounts").where({ id: googleAccountId }).first();
  return account?.domain_name || null;
}

// In handler:
const notifications = await db("notifications")
  .where({ domain_name: domain })
  .orderBy("created_at", "desc")
  .limit(10)
  .select("*");

const parsedNotifications = notifications.map((n: any) => ({
  ...n,
  metadata: n.metadata ? typeof n.metadata === "string" ? JSON.parse(n.metadata) : n.metadata : null,
}));
```

**After:**
```typescript
import { GoogleAccountModel, NotificationModel } from "../models";

// In handler:
const domain = await GoogleAccountModel.getDomainFromAccountId(Number(googleAccountId));
const notifications = await NotificationModel.findByDomain(domain, 10);
// metadata is already parsed — no manual JSON handling needed
```

### What Gets Deleted During Migration

Per route file, expect to remove:
- `import { db } from "../database/connection"` — replaced by model imports
- `getDomainFromAccountId()` helper — 2 identical copies across tasks.ts and notifications.ts
- `handleError()` helper — duplicated in 8+ files (separate extraction to utils recommended)
- All `JSON.parse()`/`JSON.stringify()` for database fields — models handle this
- All manual `created_at: new Date()`, `updated_at: new Date()` — BaseModel handles this

---

## Relationship to Existing Types

The `src/types/global.ts` file defines route-level DTOs that align with but are distinct from model interfaces:

| global.ts Type | Model Interface | Relationship |
|---------------|----------------|-------------|
| `ActionItem` | `ITask` | Same shape. `ActionItem` is the API response DTO. `ITask` is the DB row type. |
| `ActionItemCategory` | `ITask.category` | Reusable — model uses same union type `"ALLORO" \| "USER"` |
| `ActionItemStatus` | `ITask.status` | Reusable — model uses same union type |
| `Notification` | `INotification` | Same shape. `Notification` is the API response DTO. `INotification` is the DB row type. |
| `NotificationType` | `INotification.type` | Reusable — model uses same union type |
| `CreateActionItemRequest` | N/A | Route-level DTO, not a model concern |
| `CreateNotificationRequest` | N/A | Route-level DTO, not a model concern |

**Recommendation:** During migration, routes can use model interfaces directly or map to `global.ts` DTOs at the response boundary. Do not remove `global.ts` types — they serve a different purpose (API contract vs DB schema).
