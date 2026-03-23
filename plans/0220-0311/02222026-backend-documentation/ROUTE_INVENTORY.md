# Route Inventory & Classification

**Generated:** 2026-02-18
**Codebase Snapshot:** SignalsAI Backend v1.0
**Total Route Files:** 34
**Total Lines of Code:** 23,239
**Total Endpoints:** 247

---

## Summary Statistics

### By Directory
- **Main Routes** (`src/routes/`): 27 files, 15,528 LOC, 158 endpoints
- **Admin Routes** (`src/routes/admin/`): 7 files, 7,435 LOC, 84 endpoints
- **User Routes** (`src/routes/user/`): 1 file, 276 LOC, 2 endpoints

### By Complexity Tier
- **Simple** (< 200 LOC): 6 files (18%)
- **Medium** (200-900 LOC): 20 files (59%)
- **Large** (> 900 LOC): 8 files (24%)

### Top 5 Largest Files
1. **agentsV2.ts** - 4,161 LOC, 15 endpoints (Multi-agent orchestration)
2. **admin/websites.ts** - 2,771 LOC, 47 endpoints (Website builder CRUD)
3. **practiceRanking.ts** - 2,172 LOC, 14 endpoints (Ranking analysis)
4. **pms.ts** - 1,652 LOC, 17 endpoints (PMS integrations)
5. **gbp.ts** - 1,132 LOC, 11 endpoints (Google Business Profile)

---

## Complete Route File Inventory

| File | Path | LOC | Endpoints | Complexity |
|------|------|-----|-----------|------------|
| agentsV2.ts | src/routes/agentsV2.ts | 4,161 | 15 | Large |
| admin/websites.ts | src/routes/admin/websites.ts | 2,771 | 47 | Large |
| practiceRanking.ts | src/routes/practiceRanking.ts | 2,172 | 14 | Large |
| pms.ts | src/routes/pms.ts | 1,652 | 17 | Large |
| auth.ts | src/routes/auth.ts | 1,100 | 7 | Large |
| gbp.ts | src/routes/gbp.ts | 1,132 | 11 | Large |
| rag.ts | src/routes/rag.ts | 957 | 5 | Large |
| scraper.ts | src/routes/scraper.ts | 874 | 1 | Medium |
| tasks.ts | src/routes/tasks.ts | 871 | 12 | Medium |
| ga4.ts | src/routes/ga4.ts | 856 | 4 | Medium |
| settings.ts | src/routes/settings.ts | 712 | 10 | Medium |
| monday.ts | src/routes/monday.ts | 697 | 8 | Medium |
| adminAgentInsights.ts | src/routes/adminAgentInsights.ts | 697 | 8 | Medium |
| admin/agentOutputs.ts | src/routes/admin/agentOutputs.ts | 665 | 11 | Medium |
| admin/media.ts | src/routes/admin/media.ts | 532 | 4 | Medium |
| admin/imports.ts | src/routes/admin/imports.ts | 460 | 6 | Medium |
| onboarding.ts | src/routes/onboarding.ts | 452 | 7 | Medium |
| places.ts | src/routes/places.ts | 430 | 7 | Medium |
| notifications.ts | src/routes/notifications.ts | 386 | 9 | Medium |
| googleauth.ts | src/routes/googleauth.ts | 380 | 5 | Medium |
| gsc.ts | src/routes/gsc.ts | 363 | 4 | Medium |
| auth-otp.ts | src/routes/auth-otp.ts | 347 | 3 | Medium |
| clarity.ts | src/routes/clarity.ts | 337 | 5 | Medium |
| documentation.ts | src/routes/documentation.ts | 331 | 0 | Medium |
| audit.ts | src/routes/audit.ts | 327 | 4 | Medium |
| admin/organizations.ts | src/routes/admin/organizations.ts | 321 | 4 | Medium |
| user/website.ts | src/routes/user/website.ts | 276 | 2 | Medium |
| imports.ts | src/routes/imports.ts | 159 | 2 | Simple |
| websiteContact.ts | src/routes/websiteContact.ts | 156 | 1 | Simple |
| appLogs.ts | src/routes/appLogs.ts | 153 | 2 | Simple |
| profile.ts | src/routes/profile.ts | 148 | 2 | Simple |
| support.ts | src/routes/support.ts | 128 | 2 | Simple |
| admin/settings.ts | src/routes/admin/settings.ts | 117 | 3 | Simple |
| admin/auth.ts | src/routes/admin/auth.ts | 78 | 2 | Simple |

---

## Classification by Domain

### 1. Authentication Domain (3 files, 1,525 LOC, 12 endpoints)
**Purpose:** User authentication, OAuth, token management

| File | LOC | Endpoints | Notes |
|------|-----|-----------|-------|
| auth.ts | 1,100 | 7 | JWT/OAuth2, multi-tenant |
| auth-otp.ts | 347 | 3 | OTP authentication flow |
| admin/auth.ts | 78 | 2 | Admin authentication gates |

**Complexity:** Large
**Key Patterns:** JWT tokens, OAuth2 refresh, multi-tenant account management
**External APIs:** Google OAuth2

---

### 2. Google APIs Integration Domain (6 files, 3,407 LOC, 34 endpoints)
**Purpose:** Google Analytics 4, Search Console, Business Profile, Clarity, Places integration

| File | LOC | Endpoints | Notes |
|------|-----|-----------|-------|
| gbp.ts | 1,132 | 11 | Google Business Profile APIs |
| ga4.ts | 856 | 4 | Google Analytics 4 integration |
| googleauth.ts | 380 | 5 | Google OAuth callback handling |
| gsc.ts | 363 | 4 | Google Search Console integration |
| clarity.ts | 337 | 5 | Microsoft Clarity integration |
| places.ts | 430 | 7 | Google Places API wrapper |

**Complexity:** Large (collectively)
**Key Patterns:** Token refresh middleware, OAuth2 client creation, property selection
**External APIs:** Google Analytics, GSC, GBP, Microsoft Clarity, Google Places

---

### 3. PMS Integration Domain (3 files, 2,271 LOC, 25 endpoints)
**Purpose:** Practice Management System integrations and data import

| File | LOC | Endpoints | Notes |
|------|-----|-----------|-------|
| pms.ts | 1,652 | 17 | Multiple vendor integrations (Dentrix, Eaglesoft, etc.) |
| admin/imports.ts | 460 | 6 | Admin import operations |
| imports.ts | 159 | 2 | Public file serving for self-hosted imports |

**Complexity:** Large
**Key Patterns:** Data normalization, vendor-specific transformations, file uploads
**External APIs:** Apify (via service layer)

---

### 4. Agents & Automation Domain (3 files, 5,523 LOC, 34 endpoints)
**Purpose:** Multi-agent orchestration, AI processing, admin insights

| File | LOC | Endpoints | Notes |
|------|-----|-----------|-------|
| agentsV2.ts | 4,161 | 15 | Multi-client agent processing system ⚠️ VERY LARGE |
| adminAgentInsights.ts | 697 | 8 | Admin agent analytics dashboard |
| admin/agentOutputs.ts | 665 | 11 | Agent output management |

**Complexity:** Very Large ⚠️
**Key Patterns:** Batch processing, webhook handling, file logging, retry logic
**External APIs:** n8n webhooks, LLM APIs (Claude/OpenAI)

---

### 5. Ranking & Analysis Domain (1 file, 2,172 LOC, 14 endpoints)
**Purpose:** Practice ranking computation and competitive analysis

| File | LOC | Endpoints | Notes |
|------|-----|-----------|-------|
| practiceRanking.ts | 2,172 | 14 | Ranking analysis with Apify integration ⚠️ LARGE |

**Complexity:** Very Large ⚠️
**Key Patterns:** Batch processing, location analysis, LLM webhook callbacks, in-memory state tracking
**External APIs:** Apify (competitors, audits, keywords), n8n webhooks

---

### 6. Admin/Governance Domain (4 files, 1,709 LOC, 18 endpoints)
**Purpose:** System administration, organization management, admin settings

| File | LOC | Endpoints | Notes |
|------|-----|-----------|-------|
| admin/organizations.ts | 321 | 4 | Multi-organization management |
| admin/settings.ts | 117 | 3 | Admin system settings |
| admin/auth.ts | 78 | 2 | Admin authentication gates (duplicate entry) |
| admin/media.ts | 532 | 4 | Media asset management |

**Complexity:** Medium
**Key Patterns:** Super admin middleware, org-level filtering, connection status checks
**External APIs:** None (internal CRUD)

---

### 7. User Management & Settings Domain (2 files, 860 LOC, 12 endpoints)
**Purpose:** User profile, preferences, account settings

| File | LOC | Endpoints | Notes |
|------|-----|-----------|-------|
| settings.ts | 712 | 10 | User settings persistence (properties, notifications) |
| profile.ts | 148 | 2 | User profile data (phone, jurisdiction) |

**Complexity:** Medium
**Key Patterns:** RBAC middleware, token refresh, google_account filtering
**External APIs:** None

---

### 8. Website Builder Domain (3 files, 3,203 LOC, 50 endpoints)
**Purpose:** Website creation, editing, content management, publication

| File | LOC | Endpoints | Notes |
|------|-----|-----------|-------|
| admin/websites.ts | 2,771 | 47 | Website builder CRUD & schema mgmt ⚠️ LARGE |
| admin/media.ts | 532 | 4 | Media asset management (duplicate entry) |
| websiteContact.ts | 156 | 1 | Public contact form for rendered sites |
| user/website.ts | 276 | 2 | User website management (DFY tier) |

**Complexity:** Very Large ⚠️
**Key Patterns:** HTML sanitization, dynamic schema management, multi-table CRUD
**External APIs:** S3 (media uploads), Claude AI (page editing via pageEditorService)

**Note:** admin/media.ts appears in multiple domains as it serves both admin and website builder needs.

---

### 9. Notifications & Communication Domain (3 files, 670 LOC, 13 endpoints)
**Purpose:** User notifications, support tickets, contact forms

| File | LOC | Endpoints | Notes |
|------|-----|-----------|-------|
| notifications.ts | 386 | 9 | Push/email notifications CRUD |
| support.ts | 128 | 2 | Support ticket handling |
| websiteContact.ts | 156 | 1 | Rendered site contact forms (duplicate entry) |

**Complexity:** Medium
**Key Patterns:** Domain filtering, notification creation, email sending
**External APIs:** Email service (via mail utility)

---

### 10. Data Ingestion & Processing Domain (4 files, 2,489 LOC, 10 endpoints)
**Purpose:** External data collection, scraping, RAG system, audit tracking

| File | LOC | Endpoints | Notes |
|------|-----|-----------|-------|
| rag.ts | 957 | 5 | Retrieval-Augmented Generation system |
| scraper.ts | 874 | 1 | Website scraping orchestration (n8n webhooks) |
| audit.ts | 327 | 4 | Audit process tracking for leadgen tool |
| monday.ts | 697 | 8 | Monday.com integration |

**Complexity:** Large
**Key Patterns:** Webhook handlers, external API orchestration, data storage
**External APIs:** n8n, Apify, Monday.com, OpenAI (RAG)

---

### 11. Task Management Domain (1 file, 871 LOC, 12 endpoints)
**Purpose:** Task/action item CRUD for client and admin

| File | LOC | Endpoints | Notes |
|------|-----|-----------|-------|
| tasks.ts | 871 | 12 | Task management with approval workflow |

**Complexity:** Medium
**Key Patterns:** Domain filtering, category-based access (ALLORO vs USER), bulk operations
**External APIs:** None (notification helper for side effects)

---

### 12. Onboarding Domain (1 file, 452 LOC, 7 endpoints)
**Purpose:** New user setup flow

| File | LOC | Endpoints | Notes |
|------|-----|-----------|-------|
| onboarding.ts | 452 | 7 | Onboarding wizard workflow |

**Complexity:** Medium
**Key Patterns:** Multi-step workflow, OAuth integration, property selection
**External APIs:** Google OAuth2, Google APIs (property discovery)

---

### 13. System Operations Domain (2 files, 484 LOC, 2 endpoints)
**Purpose:** Background tasks, application logs, system documentation

| File | LOC | Endpoints | Notes |
|------|-----|-----------|-------|
| appLogs.ts | 153 | 2 | Application logging viewer |
| documentation.ts | 331 | 0 | API documentation serving (static content) |

**Complexity:** Simple
**Key Patterns:** Query filtering, static file serving
**External APIs:** None

**Note:** tasks.ts moved to Task Management domain; documentation.ts has 0 endpoints (static serving only).

---

## Complexity Distribution Analysis

### Simple Routes (< 200 LOC) - 6 files
**Characteristics:**
- 1-3 endpoints per file
- Minimal business logic
- Direct database queries
- Simple CRUD operations

**Files:**
1. admin/auth.ts (78 LOC, 2 endpoints)
2. admin/settings.ts (117 LOC, 3 endpoints)
3. support.ts (128 LOC, 2 endpoints)
4. profile.ts (148 LOC, 2 endpoints)
5. appLogs.ts (153 LOC, 2 endpoints)
6. imports.ts (159 LOC, 2 endpoints)
7. websiteContact.ts (156 LOC, 1 endpoint)

**Refactoring Priority:** Low (already concise)

---

### Medium Routes (200-900 LOC) - 20 files
**Characteristics:**
- 4-12 endpoints per file
- Moderate business logic
- Mix of services and direct DB queries
- Some validation and error handling

**Representative files:**
- notifications.ts (386 LOC, 9 endpoints)
- tasks.ts (871 LOC, 12 endpoints)
- settings.ts (712 LOC, 10 endpoints)
- adminAgentInsights.ts (697 LOC, 8 endpoints)

**Refactoring Priority:** Medium (service extraction candidates)

---

### Large Routes (> 900 LOC) - 8 files
**Characteristics:**
- 10+ endpoints per file
- Heavy business logic
- Complex workflows
- Multiple service dependencies
- Significant embedded business logic

**Critical Large Files:**
1. **agentsV2.ts** (4,161 LOC, 15 endpoints)
   - Multi-client agent orchestration
   - Batch processing with retry logic
   - File logging (agent-run.log)
   - Webhook handling for 7+ agent types
   - In-memory batch state tracking

2. **admin/websites.ts** (2,771 LOC, 47 endpoints)
   - Website builder full CRUD
   - HTML sanitization and schema management
   - Project/page/template/media management
   - Dynamic table queries (website_builder.*)

3. **practiceRanking.ts** (2,172 LOC, 14 endpoints)
   - Ranking analysis orchestration
   - Multi-location batch processing
   - Apify competitor analysis integration
   - LLM webhook callbacks
   - In-memory batch status tracking

4. **pms.ts** (1,652 LOC, 17 endpoints)
   - Multiple PMS vendor integrations
   - Data aggregation and transformation
   - Complex data normalization

5. **auth.ts** (1,100 LOC, 7 endpoints)
   - Multi-tenant OAuth2 flow
   - JWT token management
   - User/account creation logic
   - Token refresh handling

6. **gbp.ts** (1,132 LOC, 11 endpoints)
   - Google Business Profile full CRUD
   - Location management
   - Review handling

7. **rag.ts** (957 LOC, 5 endpoints)
   - RAG system orchestration
   - Document embedding and retrieval

8. **scraper.ts** (874 LOC, 1 endpoint)
   - Complex webhook handler
   - Apify scraping orchestration

**Refactoring Priority:** Very High ⚠️ (requires decomposition)

---

## Domain Grouping Summary

| Domain | Files | Total LOC | Total Endpoints | Complexity |
|--------|-------|-----------|-----------------|------------|
| Agents & Automation | 3 | 5,523 | 34 | Very High |
| Website Builder | 3 | 3,203 | 50 | Very High |
| Google APIs | 6 | 3,407 | 34 | High |
| Ranking & Analysis | 1 | 2,172 | 14 | Very High |
| PMS Integration | 3 | 2,271 | 25 | High |
| Data Ingestion | 4 | 2,489 | 10 | High |
| Authentication | 3 | 1,525 | 12 | High |
| Admin/Governance | 4 | 1,709 | 18 | Medium |
| Task Management | 1 | 871 | 12 | Medium |
| User Management | 2 | 860 | 12 | Medium |
| Notifications | 3 | 670 | 13 | Medium |
| Onboarding | 1 | 452 | 7 | Medium |
| System Operations | 2 | 484 | 2 | Low |

---

## Refactoring Risk Assessment

### Critical Risk Files (Require Extra Caution)
1. **agentsV2.ts** - 4,161 LOC
   - Risk: Very High
   - Reason: Core business logic, complex state management, multiple webhooks
   - Impact: Affects all agent processing workflows

2. **admin/websites.ts** - 2,771 LOC
   - Risk: High
   - Reason: Complex CRUD with HTML sanitization, multi-table dependencies
   - Impact: Affects entire website builder feature

3. **practiceRanking.ts** - 2,172 LOC
   - Risk: High
   - Reason: In-memory state, LLM webhooks, batch processing
   - Impact: Affects ranking analysis feature

### Moderate Risk Files
- pms.ts, gbp.ts, auth.ts, rag.ts (1000-1700 LOC each)
- Reason: Significant business logic but more isolated
- Can be refactored with careful service extraction

### Low Risk Files
- All Simple routes (< 200 LOC)
- Most Medium routes (200-900 LOC)
- Reason: Straightforward logic, minimal coupling

---

## Next Steps

Based on this inventory, the next phase (Phase 2: Endpoint Mapping) should prioritize:

1. **Document the 3 critical large files first** (agentsV2, admin/websites, practiceRanking)
2. **Document by domain** to identify shared patterns within each domain
3. **Flag high-risk endpoints** that require special attention during refactoring

---

## Appendix: Route File Locations

### Main Routes Directory
```
/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/
```

### Admin Routes Directory
```
/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/admin/
```

### User Routes Directory
```
/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/routes/user/
```

### Entry Point
```
/Users/rustinedave/Desktop/alloro-app/signalsai-backend/src/index.ts
```
